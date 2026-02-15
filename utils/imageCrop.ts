/** 将图片文件裁剪为正方形并压缩到指定尺寸，返回 base64 data URL */
export function cropImageToSquare(file: File, size: number = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      const w = img.width;
      const h = img.height;
      const s = Math.min(w, h);
      const sx = (w - s) / 2;
      const sy = (h - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
      try {
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}
