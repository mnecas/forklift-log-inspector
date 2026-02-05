import { useMemo } from 'react';

interface SearchHighlightProps {
  text: string;
  searchQuery: string;
  className?: string;
  highlightClassName?: string;
}

/**
 * Component that highlights matching text in search results
 */
export function SearchHighlight({
  text,
  searchQuery,
  className = '',
  highlightClassName = 'bg-yellow-200 dark:bg-yellow-500/40 text-yellow-900 dark:text-yellow-100 rounded px-0.5',
}: SearchHighlightProps) {
  const parts = useMemo(() => {
    if (!searchQuery.trim()) {
      return [{ text, highlight: false }];
    }

    const query = searchQuery.toLowerCase();
    const result: { text: string; highlight: boolean }[] = [];
    let remaining = text;
    let lowerRemaining = text.toLowerCase();

    while (lowerRemaining.length > 0) {
      const index = lowerRemaining.indexOf(query);
      if (index === -1) {
        result.push({ text: remaining, highlight: false });
        break;
      }

      if (index > 0) {
        result.push({ text: remaining.slice(0, index), highlight: false });
      }
      result.push({ text: remaining.slice(index, index + query.length), highlight: true });
      remaining = remaining.slice(index + query.length);
      lowerRemaining = lowerRemaining.slice(index + query.length);
    }

    return result;
  }, [text, searchQuery]);

  return (
    <span className={className}>
      {parts.map((part, idx) =>
        part.highlight ? (
          <mark key={idx} className={highlightClassName}>
            {part.text}
          </mark>
        ) : (
          <span key={idx}>{part.text}</span>
        )
      )}
    </span>
  );
}
