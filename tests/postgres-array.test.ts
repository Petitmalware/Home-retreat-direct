import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {postgresArray} from '../lib/postgres-http';

test('product features survive native PostgreSQL array encoding with punctuation and Unicode',()=>{
 const values=['Solid wood','Two, three','A "quoted" feature','Path \\ assembly','NULL','',null,'50°C × 2'];
 const parse=pg.types.getTypeParser(1009 as number);
 assert.deepEqual(parse(postgresArray(values)),values);
 assert.deepEqual(parse(postgresArray([])),[]);
});
