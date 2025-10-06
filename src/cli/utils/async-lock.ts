/**
 * AsyncLock - Async locking mechanism for race condition prevention
 * Prevents concurrent access to shared resources
 */
export class AsyncLock {
    private locks = new Map<string, Promise<void>>()
    private timeouts = new Map<string, NodeJS.Timeout>()
    private readonly defaultTimeout = 30000 // 30 seconds

    /**
     * Acquire a lock for the given key
     * @param key - Unique identifier for the lock
     * @param timeout - Optional timeout in milliseconds
     * @returns Release function to unlock
     */
    async acquire(key: string, timeout?: number): Promise<() => void> {
        const lockTimeout = timeout ?? this.defaultTimeout

        // Wait for existing lock to be released
        while (this.locks.has(key)) {
            await this.locks.get(key)
        }

        let release: () => void
        const lockPromise = new Promise<void>((resolve) => {
            release = () => {
                this.locks.delete(key)
                const timeoutHandle = this.timeouts.get(key)
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle)
                    this.timeouts.delete(key)
                }
                resolve()
            }
        })

        this.locks.set(key, lockPromise)

        // Set timeout to prevent deadlocks
        const timeoutHandle = setTimeout(() => {
            if (this.locks.has(key)) {
                console.warn(`[AsyncLock] Lock timeout for key: ${key}`)
                release!()
            }
        }, lockTimeout)

        this.timeouts.set(key, timeoutHandle)

        return release!
    }

    /**
     * Try to acquire lock without waiting
     * @param key - Unique identifier for the lock
     * @returns Release function if acquired, null if locked
     */
    tryAcquire(key: string): (() => void) | null {
        if (this.locks.has(key)) {
            return null
        }

        let release: () => void
        const lockPromise = new Promise<void>((resolve) => {
            release = () => {
                this.locks.delete(key)
                resolve()
            }
        })

        this.locks.set(key, lockPromise)
        return release!
    }

    /**
     * Check if a key is currently locked
     */
    isLocked(key: string): boolean {
        return this.locks.has(key)
    }

    /**
     * Get count of active locks
     */
    getActiveLockCount(): number {
        return this.locks.size
    }

    /**
     * Clear all locks (use with caution)
     */
    clearAll(): void {
        for (const timeout of this.timeouts.values()) {
            clearTimeout(timeout)
        }
        this.locks.clear()
        this.timeouts.clear()
    }
}

