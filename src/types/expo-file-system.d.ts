/**
 * Type declarations for expo-file-system
 * The module is installed as a nested dependency of expo
 */
declare module 'expo-file-system' {
  export const cacheDirectory: string | null;
  export const documentDirectory: string | null;

  export interface FileInfo {
    exists: boolean;
    isDirectory: boolean;
    modificationTime?: number;
    size?: number;
    uri: string;
    md5?: string;
  }

  export interface WriteOptions {
    encoding?: 'utf8' | 'base64';
  }

  export interface ReadOptions {
    encoding?: 'utf8' | 'base64';
    position?: number;
    length?: number;
  }

  export function writeAsStringAsync(
    fileUri: string,
    contents: string,
    options?: WriteOptions
  ): Promise<void>;

  export function readAsStringAsync(
    fileUri: string,
    options?: ReadOptions
  ): Promise<string>;

  export function getInfoAsync(
    fileUri: string,
    options?: { md5?: boolean; size?: boolean }
  ): Promise<FileInfo>;

  export function deleteAsync(
    fileUri: string,
    options?: { idempotent?: boolean }
  ): Promise<void>;

  export function makeDirectoryAsync(
    fileUri: string,
    options?: { intermediates?: boolean }
  ): Promise<void>;

  export function copyAsync(options: {
    from: string;
    to: string;
  }): Promise<void>;

  export function moveAsync(options: {
    from: string;
    to: string;
  }): Promise<void>;
}
