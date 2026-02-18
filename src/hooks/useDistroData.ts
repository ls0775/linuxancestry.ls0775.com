import { useState, useEffect, useMemo } from 'react';

export interface DistroNode {
    id: string;
    name: string;
    color?: string;
    parent?: string | null;
    start?: string;
    stop?: string;
    icon?: string;
    logo?: string;
    url?: string;
    isVirtual?: boolean;
    parentId?: string;
    actualX?: number;
    popularity?: string | null;
    description?: string | null;
    based_on?: string;
    architecture?: string;
    desktop?: string;
    category?: string;
    origin?: string;
    status?: string;
}

export function useDistroData() {
    const [data, setData] = useState<DistroNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;
        
        fetch('/distros.json')
            .then(res => {
                if (!res.ok) throw new Error(`Failed to load data: ${res.statusText}`);
                return res.json();
            })
            .then(jsonData => {
                if (isMounted) {
                    setData(jsonData);
                    setIsLoading(false);
                }
            })
            .catch(err => {
                if (isMounted) {
                    console.error('DistroData Hook Error:', err);
                    setError(err);
                    setIsLoading(false);
                }
            });

        return () => { isMounted = false; };
    }, []);

    // Provide a consistently memoized empty array when loading
    const safeData = useMemo(() => data, [data]);

    return { data: safeData, isLoading, error };
}
