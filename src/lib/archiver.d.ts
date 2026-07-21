// Archiver factory function type — adds the default export not present in @types/archiver
declare module 'archiver' {
  import { ArchiverOptions } from '@types/archiver';
  import { Archiver } from '@types/archiver';
  const _default: (format: string, options?: ArchiverOptions) => Archiver;
  export default _default;
  export = _default;
}
