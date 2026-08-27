'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  ImageIcon,
} from 'lucide-react';

interface PropertyGalleryProps {
  images: string[];
  title: string;
}

export function PropertyGallery({ images, title }: PropertyGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const safeImages = images && images.length > 0 ? images : ['/images/placeholder.jpg'];
  const totalImages = safeImages.length;

  const handlePrev = useCallback(() => {
    setSelectedIndex((prev) => (prev === 0 ? totalImages - 1 : prev - 1));
  }, [totalImages]);

  const handleNext = useCallback(() => {
    setSelectedIndex((prev) => (prev === totalImages - 1 ? 0 : prev + 1));
  }, [totalImages]);

  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false);
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, handlePrev, handleNext]);

  return (
    <div className="space-y-4">
      {/* Main Image View */}
      <div className="group relative h-[300px] w-full overflow-hidden rounded-2xl bg-gray-100 shadow-sm sm:h-[420px] md:h-[500px]">
        {safeImages[selectedIndex] ? (
          <Image
            src={safeImages[selectedIndex]}
            alt={`${title} - Görsel ${selectedIndex + 1}`}
            fill
            priority
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw, 800px"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
            <ImageIcon className="mb-2 h-16 w-16 stroke-1" />
            <span className="text-sm">Görsel bulunamadı</span>
          </div>
        )}

        {/* Counter Badge */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>
            {selectedIndex + 1} / {totalImages}
          </span>
        </div>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={() => setIsLightboxOpen(true)}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/80"
          aria-label="Fotoğrafları büyüt"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Tüm Fotoğraflar ({totalImages})</span>
        </button>

        {/* Navigation Buttons */}
        {totalImages > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2.5 text-gray-800 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:scale-110 focus:outline-none"
              aria-label="Önceki Fotoğraf"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2.5 text-gray-800 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:scale-110 focus:outline-none"
              aria-label="Sonraki Fotoğraf"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail Strip */}
      {totalImages > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar">
          {safeImages.map((img, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg transition-all focus:outline-none sm:h-24 sm:w-32 ${
                selectedIndex === index
                  ? 'ring-2 ring-blue-600 ring-offset-2 opacity-100'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <Image
                src={img}
                alt={`${title} küçük görsel ${index + 1}`}
                fill
                className="object-cover"
                sizes="128px"
              />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {isLightboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg">
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute right-6 top-6 z-50 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20 focus:outline-none"
            aria-label="Kapat"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="relative flex h-[80vh] w-[90vw] items-center justify-center md:w-[80vw]">
            {safeImages[selectedIndex] && (
              <Image
                src={safeImages[selectedIndex]}
                alt={`${title} - Tam Ekran Görsel ${selectedIndex + 1}`}
                fill
                priority
                className="object-contain"
                sizes="100vw"
              />
            )}
          </div>

          {totalImages > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-all hover:bg-white/20 hover:scale-110 focus:outline-none md:left-8"
                aria-label="Önceki"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-all hover:bg-white/20 hover:scale-110 focus:outline-none md:right-8"
                aria-label="Sonraki"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-md">
            {selectedIndex + 1} / {totalImages}
          </div>
        </div>
      )}
    </div>
  );
}
