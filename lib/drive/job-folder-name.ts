const DRIVE_FORBIDDEN = /[/\\?*:|"<>]/g;

/** One root folder name: client, date (UTC YYYY-MM-DD from job createdAt), project. */
export function buildDriveJobFolderName(params: {
  customerName: string;
  projectName: string;
  createdAt: Date;
}): string {
  const day = params.createdAt.toISOString().slice(0, 10);
  const raw = `${params.customerName} - ${day} - ${params.projectName}`;
  return sanitizeDriveFileFolderName(raw);
}

export function sanitizeDriveFileFolderName(name: string): string {
  const s = name.replace(DRIVE_FORBIDDEN, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
  return s.length > 0 ? s : 'Job folder';
}
