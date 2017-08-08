/// <reference types="node" />

import { EventEmitter } from "events"

export class Pool<T> extends EventEmitter {
    spareResourceCapacity: number
    size: number
    available: number
    borrowed: number
    pending: number
    max: number
    min: number

    acquire(priority?: number): Promise<T>
    release(resource: T): void
    destroy(resource: T): void
    drain(): Promise<void>
}

export interface Factory<T> {
    create: () => Promise<T>
    destroy: (client: T) => Promise<void>
    validate?: (client: T) => Promise<boolean>
}

export interface Options {
    max?: number
    min?: number
    maxWaitingClients?: number
    testOnBorrow?: boolean
    acquireTimeoutMillis?: number
    fifo?: boolean
    priorityRange?: number
    autostart?: boolean
    evictionRunIntervalMillis?: number
    numTestsPerRun?: number
    softIdleTimeoutMillis?: number
    idleTimeoutMillis?: number
    Promise?: any
}

export function createPool<T>(factory: Factory<T>, opts?: Options): Pool<T>
