import { useState, useCallback } from "react";
import type { ImageAttachment } from "../types";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function fileToImageAttachment(file: File): Promise<ImageAttachment> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            if (!dataUrl) {
                reject(new Error(`读取文件 ${file.name} 失败`));
                return;
            }
            const base64 = dataUrl.split(",")[1] ?? "";
            resolve({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                dataUrl,
                base64,
                name: file.name,
            });
        };
        reader.onerror = () => reject(new Error(`读取文件 ${file.name} 失败`));
        reader.readAsDataURL(file);
    });
}

export function useImageAttachments() {
    const [images, setImages] = useState<ImageAttachment[]>([]);
    const [error, setError] = useState<string | null>(null);

    const addFiles = useCallback(
        async (files: FileList | File[]) => {
            setError(null);
            const fileArr = Array.from(files);

            for (const file of fileArr) {
                if (!ALLOWED_TYPES.includes(file.type)) {
                    setError(`不支持的图片格式: ${file.name}，仅支持 PNG/JPG/GIF/WebP`);
                    continue;
                }
                if (file.size > MAX_FILE_SIZE) {
                    setError(`文件过大: ${file.name}，最大 5MB`);
                    continue;
                }

                setImages((prev) => {
                    if (prev.length >= MAX_IMAGES) {
                        setError(`最多只能添加 ${MAX_IMAGES} 张图片`);
                        return prev;
                    }
                    return prev;
                });
            }

            const currentCount = images.length;
            const validFiles = fileArr.filter(
                (f) => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE,
            );
            const canAdd = Math.min(validFiles.length, MAX_IMAGES - currentCount);

            if (canAdd <= 0) return;

            const newImages = await Promise.all(
                validFiles.slice(0, canAdd).map(fileToImageAttachment),
            );
            setImages((prev) => [...prev, ...newImages]);
        },
        [images.length],
    );

    const removeImage = useCallback((id: string) => {
        setImages((prev) => prev.filter((img) => img.id !== id));
        setError(null);
    }, []);

    const clearImages = useCallback(() => {
        setImages([]);
        setError(null);
    }, []);

    return { images, error, addFiles, removeImage, clearImages };
}
