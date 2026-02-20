"use client";

import Image from "next/image";
import { useState } from "react";
import type { Attachment } from "@/lib/types";

interface ImageGalleryProps {
  images: Attachment[];
  toolName: string;
}

export default function ImageGallery({ images, toolName }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-muted-bg text-muted">
        No image available
      </div>
    );
  }

  const selected = images[selectedIndex];
  const imageUrl =
    selected.thumbnails?.full?.url ||
    selected.thumbnails?.large?.url ||
    selected.url;

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
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => {
            const thumbUrl =
              img.thumbnails?.small?.url || img.url;
            return (
              <button
                key={img.id}
                onClick={() => setSelectedIndex(i)}
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
