"use client";

import {
  IMAGE_EXTENSIONS,
  MAXIMUM_IMAGE_SIZE,
} from "@workers-image-resize-delivery/common/constants";
import {
  SignedUrlRequestSchema,
  SignedUrlResponseSchema,
} from "@workers-image-resize-delivery/common/schema";
import classNames from "classnames";
import Image from "next/image";
import { useState } from "react";
import * as v from "valibot";

export default function ImageUpload() {
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!process.env.NEXT_PUBLIC_CDN_URL) return;
    const files = event.target.files;
    if (!files || files.length === 0) {
      console.error("No files selected");
      return;
    }

    try {
      const urls = await Promise.all(
        Array.from(files).map(async (file) => {
          if (file.size > MAXIMUM_IMAGE_SIZE) {
            throw new Error("Image size exceeds limit");
          }
          const { path, extension } = v.parse(SignedUrlRequestSchema, {
            path: "images",
            extension: file.name.split(".").pop() ?? "",
          });
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_CDN_URL}/signed-url`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ path, extension }),
            }
          );
          if (!response.ok) {
            throw new Error("Failed to get signed URL");
          }
          const { url, key } = v.parse(
            SignedUrlResponseSchema,
            await response.json()
          );
          const putResponse = await fetch(url, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type,
            },
          });
          if (!putResponse.ok) {
            throw new Error("Failed to upload image");
          }
          return url;
        })
      );
      setImageUrls(urls);
      console.log("All Images uploaded successfully");
    } catch (error) {
      if (error instanceof v.ValiError) {
        console.error("Validation Error: ", error);
      }
      console.error("Image upload Error: ", error);
    }
  }
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <label className="block text-lg font-medium text-gray-700 mb-2">
          画像をアップロード
        </label>
        <input
          type="file"
          multiple
          accept={IMAGE_EXTENSIONS.join(",")}
          onChange={handleFileChange}
          className={classNames(
            "block w-full text-sm text-gray-700",
            "file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          )}
        />
      </div>

      {imageUrls.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {imageUrls.map((url) => (
            <div
              key={url}
              className="rounded-lg overflow-hidden shadow-md border border-gray-200"
            >
              <Image
                src={url}
                alt="uploaded image"
                width={960}
                height={960}
                className="w-full h-auto object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
