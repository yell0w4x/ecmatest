// import jestCli from 'jest-cli';
// const jest = await import('jest');
import jest from 'jest';

// import {jest} from '@jest/globals';

// import { createRequire } from 'node:module';
// const require = createRequire(import.meta.url);

// const jest = require('jest');

console.log('1', jest);
await jest.run(['--passWithNoTests']);
