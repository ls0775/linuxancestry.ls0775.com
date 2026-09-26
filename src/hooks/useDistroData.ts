import { useState, useEffect } from 'react';

export interface DistroNode {
    id: string;
    name: string;
    parent?: string | null;
    start?: string;
    stop?: string;
    color?: string;
    icon?: string;
    logo?: string;
    url?: string;
    popularity?: string | null;
    description?: string | null;
    based_on?: string;
    architecture?: string;
    desktop?: string;
    category?: string;
    origin?: string;
    status?: string;
}

export interface DistroDataState {
    data: DistroNode[];
    isLoading: boolean;
    error: Error | null;
    reload: () => void;
}

export function useDistroData(url = '/distros.json'): DistroDataState {
    const [data, setData] = useState<DistroNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();

        fetch(url, { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error(`Failed to load data (${res.status} ${res.statusText})`);
                return res.json() as Promise<unknown>;
            })
            .then(json => {
                if (!Array.isArray(json)) throw new Error('Data file is not a list of distributions');
                setData(json as DistroNode[]);
                setIsLoading(false);
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            });

        return () => controller.abort();
    }, [url, attempt]);

    const reload = () => {
        setError(null);
        setIsLoading(true);
        setAttempt(a => a + 1);
    };

    return { data, isLoading, error, reload };
}
