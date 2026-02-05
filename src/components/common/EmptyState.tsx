interface EmptyStateProps {
  icon?: 'document' | 'search' | 'folder' | 'error';
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const icons = {
  document: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  ),
  search: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  ),
  folder: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  ),
  error: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  ),
};

/**
 * Reusable empty state component for displaying placeholder content
 */
export function EmptyState({ icon = 'document', title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <svg
        className="w-16 h-16 mx-auto text-slate-400 dark:text-gray-500 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        {icons[icon]}
      </svg>
      <h3 className="text-lg font-medium text-slate-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-slate-500 dark:text-gray-400 mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
