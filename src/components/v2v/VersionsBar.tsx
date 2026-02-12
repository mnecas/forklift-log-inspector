import type { V2VComponentVersions } from '../../types/v2v';

interface VersionsBarProps {
  versions: V2VComponentVersions;
}

const VERSION_KEYS: { key: keyof V2VComponentVersions; label: string }[] = [
  { key: 'virtV2v', label: 'virt-v2v' },
  { key: 'libvirt', label: 'libvirt' },
  { key: 'nbdkit', label: 'nbdkit' },
  { key: 'vddk', label: 'VDDK' },
  { key: 'libguestfs', label: 'libguestfs' },
  { key: 'qemu', label: 'QEMU' },
  { key: 'virtioWin', label: 'virtio-win' },
];

export function VersionsBar({ versions }: VersionsBarProps) {
  const items = VERSION_KEYS.filter((item) => versions[item.key]);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-gray-500">
      {items.map((item, idx) => (
        <span key={item.key} className="inline-flex items-baseline gap-1">
          <span>{item.label}</span>
          <span className="font-mono text-slate-600 dark:text-gray-400">{versions[item.key]}</span>
          {idx < items.length - 1 && (
            <span className="ml-3 text-slate-300 dark:text-gray-700">·</span>
          )}
        </span>
      ))}
    </div>
  );
}
