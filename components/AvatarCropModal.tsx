"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";

interface CropArea { x: number; y: number; width: number; height: number; }

interface Props {
  imageSrc: string;
  onCancel: () => void;
  onCrop: (croppedBlob: Blob) => void;
}

async function getCroppedImg(imageSrc: string, cropArea: CropArea): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const size = 300; // output at 300×300
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(
    img,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    size,
    size,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/jpeg", 0.92);
  });
}

export default function AvatarCropModal({ imageSrc, onCancel, onCrop }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [applying, setApplying] = useState(false);

  const onCropComplete = useCallback((_: unknown, pixels: CropArea) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleApply() {
    if (!croppedAreaPixels) return;
    setApplying(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCrop(blob);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="crop-overlay" onClick={onCancel}>
      <div className="crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="crop-modal-header">
          <span className="crop-modal-title">Adjust photo</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="crop-area-wrap">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="crop-controls">
          <div className="crop-zoom-row">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M7 4.5V9.5M4.5 7H9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="crop-zoom-slider"
              aria-label="Zoom"
            />
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M7 4.5V9.5M4.5 7H9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="crop-hint">Drag to reposition · Scroll or slide to zoom</p>

          <div className="crop-actions">
            <button type="button" className="crop-cancel-btn" onClick={onCancel}>Cancel</button>
            <button type="button" className="crop-apply-btn" onClick={handleApply} disabled={applying}>
              {applying ? "Applying…" : "Use this photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
