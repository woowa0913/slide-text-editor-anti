export const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onabort = () => reject(new Error("File reading was aborted."));
    reader.readAsDataURL(file);
  });
};

export const loadImage = (src: string, timeoutMs = 15000): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let timeoutId: number | null = window.setTimeout(() => {
      cleanup();
      reject(new Error("Image loading timed out."));
    }, timeoutMs);

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      resolve(img);
    };

    img.onerror = () => {
      cleanup();
      reject(new Error("Image loading failed."));
    };

    img.src = src;
  });
};
