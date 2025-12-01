/**
 * Formats Google Drive URLs to be viewable
 * Ported from Python format_drive_link function
 */
export function formatDriveLink(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') {
    return 'https://placehold.co/200x200?text=No+Image';
  }

  const trimmedUrl = url.trim();

  // Handle Google Drive links
  if (trimmedUrl.includes('drive.google.com')) {
    let fileId: string | null = null;

    // Scenario 1: /file/d/ID/view
    if (trimmedUrl.includes('/file/d/')) {
      const parts = trimmedUrl.split('/file/d/');
      if (parts.length > 1) {
        const idPart = parts[1].split('/')[0];
        if (idPart) {
          fileId = idPart;
        }
      }
    }
    // Scenario 2: id=ID parameter
    else if (trimmedUrl.includes('id=')) {
      const parts = trimmedUrl.split('id=');
      if (parts.length > 1) {
        const idPart = parts[1].split('&')[0];
        if (idPart) {
          fileId = idPart;
        }
      }
    }

    if (fileId) {
      return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
  }

  return trimmedUrl;
}

