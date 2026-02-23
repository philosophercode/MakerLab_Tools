"use client";

import Image from "next/image";
import { useState } from "react";
import type { Attachment } from "@/lib/types";

interface ImageGalleryProps {
  images: Attachment[];
  toolName: string;
  localImageUrl?: string;
}

export default function ImageGallery({ images, toolName, localImageUrl }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const safeName = toolName.replace(/\//g, "_");
  const preferredUrl =
    localImageUrl || `/tool-images/${encodeURIComponent(`${safeName}.png`)}`;
  const hasLocalImage = preferredUrl.startsWith("/tool-images/");

  if (images.length === 0 && !preferredUrl) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-muted-bg text-muted">
        No image available
      </div>
    );
  }

  const imageUrl = hasLocalImage
    ? preferredUrl
    : (images[selectedIndex]?.thumbnails?.large?.url ??
      images[selectedIndex]?.url ??
      preferredUrl);

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted-bg">
        <Image
          src={imageUrl}
          alt={`${toolName} - image ${selectedIndex + 1}`}
          fill
          className="object-contain p-4"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
        />
      </div>

      {/* Thumbnails */}
      {!hasLocalImage && images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => {
            const thumbUrl =
              img.thumbnails?.small?.url || img.url || preferredUrl;
            return (
              <button
                key={img.id}
                onClick={() => setSelectedIndex(i)}
                aria-label={`View image ${i + 1} of ${images.length}`}
                aria-current={i === selectedIndex ? "true" : undefined}
                className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                  i === selectedIndex
                    ? "border-cornell-red"
                    : "border-card-border hover:border-muted"
                }`}
              >
                <Image
                  src={thumbUrl}
                  alt={`${toolName} thumbnail ${i + 1}`}
                  fill
                  className="object-contain p-1"
                  sizes="64px"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
