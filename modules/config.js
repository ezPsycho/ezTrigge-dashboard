import path from 'path';

import mri from 'mri';

const args = mri(process.argv.slice(2));

const serverPackagePath = args.dir
  ? args.dir
  : path.join(process.cwd(), 'programs');

export { serverPackagePath };
