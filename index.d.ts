// Type definitions for node-pool 3.1
// Derived from https://github.com/DefinitelyTyped/DefinitelyTyped
// -> https://github.com/DefinitelyTyped/DefinitelyTyped/blob/454dcbcbe5e932010b128dca9793758dd28adb45/types/generic-pool/index.d.ts

/// <reference types="node" />

import { EventEmitter } from "events";

export class Deferred<T> {
  get state(): 'PENDING' | 'FULFILLED' | 'REJECTED';

  get promise(): Promise<T>;

  reject(reason: any): void;

  resolve(value: T): void;
}

export class ResourceRequest<T> extends Deferred<T> {
  setTimeout(delay: number): void;

  removeTimeout(): void;
}

export enum PooledResourceStateEnum {
  ALLOCATED = 'ALLOCATED',
  IDLE = 'IDLE',
  INVALID = 'INVALID',
  RETURNING = 'RETURNING',
  VALIDATION = 'VALIDATION',
}

export class PooledResource<T> {
  creationTime: number;
  lastReturnTime?: number;
  lastBorrowTime?: number;
  lastIdleTime?: number;
  obj: T;
  state: PooledResourceStateEnum;

  allocate(): void;

  deallocate(): void;

  invalidate(): void;

  test(): void;

  idle(): void;

  returning(): void;
}

export interface IDeque<T> extends Iterable<T> {
  shift(): T | undefined;

  unshift(element: T): void;

  push(element: T): void;

  pop(): T | undefined;

  get head(): T | undefined;

  get tail(): T | undefined;

  get length(): number;

  iterator(): Iterator<T>;

  reverseIterator(): Iterator<T>;
}

export class Deque<T> implements IDeque<T> {
  shift(): T | undefined;

  unshift(element: T): void;

  push(element: T): void;

  pop(): T | undefined;

  get head(): T | undefined;

  get tail(): T | undefined;

  get length(): number;

  iterator(): Iterator<T>;

  reverseIterator(): Iterator<T>;

  [Symbol.iterator](): Iterator<T>;
}

export interface IPriorityQueue<T> {
  get length(): number;

  enqueue(obj: T, priority?: number): void;

  dequeue(): T | undefined;

  get head(): T | undefined;

  get tail(): T | undefined;
}

export class PriorityQueue<T> implements IPriorityQueue<T> {
  constructor(priorityRange: number);

  get length(): number;

  enqueue(obj: T, priority?: number): void;

  dequeue(): T | undefined;

  get head(): T | undefined;

  get tail(): T | undefined;
}

export interface IEvictorConfig {
  softIdleTimeoutMillis: number;
  idleTimeoutMillis: number;
  min: number;
  maxAgeMillis: number;
}

export interface IEvictor<T> {
  evict(config: IEvictorConfig, pooledResource: PooledResource<T>, availableObjectsCount: number): boolean;
}

export class DefaultEvictor<T> implements IEvictor<T> {
  evict(config: IEvictorConfig, pooledResource: PooledResource<T>, availableObjectsCount: number): boolean;
}

export interface Factory<T> {
  create(): Promise<T>;

  destroy(client: T): Promise<void>;

  validate?(client: T): Promise<boolean>;
}

export interface Options {
  max?: number;
  min?: number;
  maxWaitingClients?: number;
  testOnBorrow?: boolean;
  acquireTimeoutMillis?: number;
  destroyTimeoutMillis?: number;
  fifo?: boolean;
  priorityRange?: number;
  autostart?: boolean;
  evictionRunIntervalMillis?: number;
  numTestsPerEvictionRun?: number;
  softIdleTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  maxAgeMillis?: number;
}

export class Pool<T> extends EventEmitter {
  spareResourceCapacity: number;
  size: number;
  available: number;
  borrowed: number;
  pending: number;
  max: number;
  min: number;

  constructor(
    Evictor: { new (): IEvictor<T> },
    Deque: { new (): IDeque<PooledResource<T>> },
    PriorityQueue: { new (priorityRange: number): IPriorityQueue<ResourceRequest<T>> },
    factory: Factory<T>,
    options?: Options,
  );

  start(): void;

  acquire(priority?: number): Promise<T>;

  release(resource: T): Promise<void>;

  destroy(resource: T): Promise<void>;

  drain(): Promise<void>;

  clear(): Promise<void>;

  use<U>(cb: (resource: T) => U | Promise<U>): Promise<U>;

  isBorrowedResource(resource: T): boolean;

  ready(): Promise<void>;
}

export function createPool<T>(factory: Factory<T>, opts?: Options): Pool<T>;
