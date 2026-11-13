export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, index);
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond) return "";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatCount(count: number): string {
  if (!count) return "0";
  if (count >= 100_000_000) return `${(count / 100_000_000).toFixed(1)} 亿`;
  if (count >= 10_000) return `${(count / 10_000).toFixed(1)} 万`;
  return String(count);
}

export function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const date = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function etaText(received: number, total: number, speed: number): string {
  if (!speed || !total || total <= received) return "";
  const remaining = (total - received) / speed;
  if (!Number.isFinite(remaining) || remaining <= 0) return "";
  if (remaining < 60) return `剩余 ${Math.ceil(remaining)} 秒`;
  return `剩余 ${Math.ceil(remaining / 60)} 分钟`;
}
