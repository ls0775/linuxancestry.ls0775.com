import React, { useEffect, useId, useRef, useState } from 'react';
import type { DistroNode } from '../hooks/useDistroData';

interface SearchBoxProps {
    value: string;
    onChange: (value: string) => void;
    suggestions: DistroNode[];
    className?: string;
}

/** Search input with an ARIA combobox suggestion list. */
const SearchBox: React.FC<SearchBoxProps> = ({ value, onChange, suggestions, className = '' }) => {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const rootRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    const expanded = open && suggestions.length > 0;

    // Close when focus or a pointer lands outside the widget.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const choose = (node: DistroNode) => {
        onChange(node.name);
        setOpen(false);
        setActiveIndex(-1);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            if (expanded) { setOpen(false); setActiveIndex(-1); }
            else if (value) onChange('');
            return;
        }
        if (!expanded) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => (i < suggestions.length - 1 ? i + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => (i > 0 ? i - 1 : suggestions.length - 1));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            choose(suggestions[activeIndex]);
        }
    };

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <input
                type="search"
                className="field"
                role="combobox"
                aria-label="Search distributions"
                aria-autocomplete="list"
                aria-expanded={expanded}
                aria-controls={listId}
                aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
                placeholder="Search distributions"
                autoComplete="off"
                value={value}
                onChange={e => { onChange(e.target.value); setOpen(true); setActiveIndex(-1); }}
                onFocus={() => { setOpen(true); setActiveIndex(-1); }}
                onBlur={e => { if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
                onKeyDown={onKeyDown}
            />
            {expanded && (
                <ul id={listId} className="panel absolute top-full left-0 right-0 z-50 list-none m-0 p-0" role="listbox">
                    {suggestions.map((s, idx) => (
                        <li key={s.id} id={`${listId}-${idx}`} role="option" aria-selected={idx === activeIndex}>
                            <button
                                type="button"
                                tabIndex={-1}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => choose(s)}
                                className={`w-full text-left px-3 py-1.5 flex items-baseline justify-between gap-3 border-t border-rule first:border-t-0 ${idx === activeIndex ? 'text-text underline decoration-1 underline-offset-[0.2em]' : 'text-muted hover:text-text'}`}
                            >
                                <span className="truncate">{s.name}</span>
                                <span className="text-[0.8rem] font-light shrink-0 tabular-nums">{s.start?.slice(0, 4)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SearchBox;
