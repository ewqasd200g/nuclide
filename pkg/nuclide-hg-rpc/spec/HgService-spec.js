/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import nuclideUri from 'nuclide-commons/nuclideUri';
import * as HgService from '../lib/HgService';
import * as hgUtils from '../lib/hg-utils';
import {
  AmendMode,
  StatusCodeId,
  MergeConflictStatus,
} from '../lib/hg-constants';
import invariant from 'assert';
import {Observable, Subject} from 'rxjs';

const mockOutput = `
[
{
  "command":"rebase",
  "conflicts":[
    {
       "base":{
          "contents": "",
          "exists":true,
          "isexec":false,
          "issymlink":false
       },
       "local":{
          "contents": "t1",
          "exists":true,
          "isexec":false,
          "issymlink":false
       },
       "other":{
          "contents":"t2",
          "exists":true,
          "isexec":false,
          "issymlink":false
       },
       "output":{
          "contents": "\u003c\u003c\u003c\u003c\u003c\u003c\u003c dest:   aeef989d24c2 - asriram: t1\\nt1\\n=======\\nt2\\n\u003e\u003e\u003e\u003e\u003e\u003e\u003e source: 64c253f3c1d7 - asriram: t2\\n",
          "exists":true,
          "isexec":false,
          "issymlink":false,
          "path":"temp1"
       },
       "path":"temp1"
    },
    {
       "base":{
          "contents": "",
          "exists":false,
          "isexec":false,
          "issymlink":false
       },
       "local":{
          "contents": "t1",
          "exists":false,
          "isexec":false,
          "issymlink":false
       },
       "other":{
          "contents":"t2",
          "exists":true,
          "isexec":false,
          "issymlink":false
       },
       "output":{
          "contents": "\u003c\u003c\u003c\u003c\u003c\u003c\u003c dest:   aeef989d24c2 - asriram: t1\\nt1\\n=======\\nt2\\n\u003e\u003e\u003e\u003e\u003e\u003e\u003e source: 64c253f3c1d7 - asriram: t2\\n",
          "exists":true,
          "isexec":false,
          "issymlink":false,
          "path":"temp2"
       },
       "path":"temp2"
    }
  ]
}
]`;

describe('HgService', () => {
  const hgService = HgService;
  const TEST_WORKING_DIRECTORY = '/Test/Working/Directory/';
  const PATH_1 = nuclideUri.join(TEST_WORKING_DIRECTORY, 'test1.js');
  const PATH_2 = nuclideUri.join(TEST_WORKING_DIRECTORY, 'test2.js');
  function relativize(filePath: string): string {
    return nuclideUri.relative(TEST_WORKING_DIRECTORY, filePath);
  }

  describe('::createBookmark', () => {
    const BOOKMARK_NAME = 'fakey456';
    const BASE_REVISION = 'fakey123';

    it('calls the appropriate `hg` command to add', () => {
      waitsForPromise(async () => {
        spyOn(hgUtils, 'hgAsyncExecute');
        await hgService.createBookmark(TEST_WORKING_DIRECTORY, BOOKMARK_NAME);
        expect(hgUtils.hgAsyncExecute).toHaveBeenCalledWith(
          ['bookmark', BOOKMARK_NAME],
          {cwd: TEST_WORKING_DIRECTORY},
        );
      });
    });

    it('calls the appropriate `hg` command to add with base revision', () => {
      waitsForPromise(async () => {
        spyOn(hgUtils, 'hgAsyncExecute');
        await hgService.createBookmark(
          TEST_WORKING_DIRECTORY,
          BOOKMARK_NAME,
          BASE_REVISION,
        );
        expect(hgUtils.hgAsyncExecute).toHaveBeenCalledWith(
          ['bookmark', '--rev', BASE_REVISION, BOOKMARK_NAME],
          {cwd: TEST_WORKING_DIRECTORY},
        );
      });
    });
  });

  describe('::deleteBookmark', () => {
    const BOOKMARK_NAME = 'fakey456';

    it('calls the appropriate `hg` command to delete', () => {
      waitsForPromise(async () => {
        spyOn(hgUtils, 'hgAsyncExecute');
        await hgService.deleteBookmark(TEST_WORKING_DIRECTORY, BOOKMARK_NAME);
        expect(hgUtils.hgAsyncExecute).toHaveBeenCalledWith(
          ['bookmarks', '--delete', BOOKMARK_NAME],
          {cwd: TEST_WORKING_DIRECTORY},
        );
      });
    });
  });

  describe('::renameBookmark', () => {
    const BOOKMARK_NAME = 'fakey456';

    it('calls the appropriate `hg` command to rename', () => {
      waitsForPromise(async () => {
        spyOn(hgUtils, 'hgAsyncExecute');
        await hgService.renameBookmark(
          TEST_WORKING_DIRECTORY,
          BOOKMARK_NAME,
          'fried-chicken',
        );
        expect(hgUtils.hgAsyncExecute).toHaveBeenCalledWith(
          ['bookmarks', '--rename', BOOKMARK_NAME, 'fried-chicken'],
          {cwd: TEST_WORKING_DIRECTORY},
        );
      });
    });
  });

  describe('::fetchDiffInfo', () => {
    const mockHgDiffOutput = `diff --git test-test/blah/blah.js test-test/blah/blah.js
    --- test1.js
    +++ test1.js
    @@ -150,1 +150,2 @@
    -hi
    +
    +asdfdf`;

    const expectedDiffInfo = {
      added: 2,
      deleted: 1,
      lineDiffs: [
        {
          oldStart: 150,
          oldLines: 1,
          newStart: 150,
          newLines: 2,
        },
      ],
    };

    it('fetches the unified diff output for the given path.', () => {
      // Test set up: mock out dependency on hg.
      invariant(hgService);
      spyOn(hgUtils, 'hgAsyncExecute').andCallFake((args, options) => {
        expect(args.pop()).toBe(PATH_1);
        return Promise.resolve({stdout: mockHgDiffOutput});
      });

      waitsForPromise(async () => {
        invariant(hgService);
        const pathToDiffInfo = await hgService.fetchDiffInfo(
          TEST_WORKING_DIRECTORY,
          [PATH_1],
        );
        invariant(pathToDiffInfo);
        expect(pathToDiffInfo.size).toBe(1);
        expect(pathToDiffInfo.get(PATH_1)).toEqual(expectedDiffInfo);
      });
    });
  });

  describe('::getConfigValueAsync', () => {
    it('calls `hg config` with the passed key', () => {
      spyOn(hgUtils, 'hgAsyncExecute').andCallFake((args, options) => {
        expect(args).toEqual(['config', 'committemplate.emptymsg']);
        // Return the Object shape expected by `HgServiceBase`.
        return {stdout: ''};
      });
      waitsForPromise(async () => {
        await hgService.getConfigValueAsync(
          TEST_WORKING_DIRECTORY,
          'committemplate.emptymsg',
        );
      });
    });

    it('returns `null` on errors', () => {
      spyOn(hgUtils, 'hgAsyncExecute').andThrow(new Error('Something failed'));
      waitsForPromise(async () => {
        const config = await hgService.getConfigValueAsync(
          TEST_WORKING_DIRECTORY,
          'non.existent.config',
        );
        expect(config).toBeNull();
      });
    });
  });

  describe('::rename', () => {
    it('can rename files', () => {
      let wasCalled = false;
      spyOn(hgUtils, 'hgAsyncExecute').andCallFake((args, options) => {
        expect(args.length).toBe(3);
        expect(args.pop()).toBe('file_2.txt');
        expect(args.pop()).toBe('file_1.txt');
        expect(args.pop()).toBe('rename');
        wasCalled = true;
      });
      waitsForPromise(async () => {
        await hgService.rename(
          TEST_WORKING_DIRECTORY,
          ['file_1.txt'],
          'file_2.txt',
        );
        expect(wasCalled).toBeTruthy();
      });
    });
  });

  describe('::remove', () => {
    it('can remove files', () => {
      let wasCalled = false;
      spyOn(hgUtils, 'hgAsyncExecute').andCallFake((args, options) => {
        expect(args.length).toBe(3);
        expect(args.pop()).toBe('file.txt');
        expect(args.pop()).toBe('-f');
        expect(args.pop()).toBe('remove');
        wasCalled = true;
      });
      waitsForPromise(async () => {
        await hgService.remove(TEST_WORKING_DIRECTORY, ['file.txt']);
        expect(wasCalled).toBeTruthy();
      });
    });
  });

  describe('::add', () => {
    it('can add files', () => {
      let wasCalled = false;
      spyOn(hgUtils, 'hgAsyncExecute').andCallFake((args, options) => {
        expect(args.length).toBe(2);
        expect(args.pop()).toBe('file.txt');
        expect(args.pop()).toBe('add');
        wasCalled = true;
      });
      waitsForPromise(async () => {
        await hgService.add(TEST_WORKING_DIRECTORY, ['file.txt']);
        expect(wasCalled).toBeTruthy();
      });
    });
  });

  describe('::commit|amend', () => {
    const commitMessage = 'foo\n\nbar\nbaz';
    const processMessage = {
      kind: 'stdout',
      data: 'Fake message for testing',
    };
    let committedToHg = false;
    let expectedArgs = null;
    beforeEach(() => {
      expectedArgs = null;
      committedToHg = false;
      spyOn(hgUtils, 'hgObserveExecution').andCallFake((_args, options) => {
        const args = _args;
        expect(expectedArgs).not.toBeNull();
        // eslint-disable-next-line eqeqeq
        invariant(expectedArgs !== null);
        expect(args.length).toBe(
          expectedArgs.length,
          `\nExpected args: [${expectedArgs.toString()}]\nActual args: [${args.toString()}]`,
        );
        while (args.length > 0) {
          const expectedArg = expectedArgs.pop();
          expect(args.pop()).toBe(expectedArg);
        }
        committedToHg = true;
        return Observable.of(processMessage);
      });
    });

    describe('::commit', () => {
      it('can commit changes', () => {
        expectedArgs = ['commit', '-m', commitMessage];
        waitsForPromise(async () => {
          await hgService
            .commit(TEST_WORKING_DIRECTORY, commitMessage)
            .refCount()
            .toArray()
            .toPromise();
          expect(committedToHg).toBeTruthy('Looks like commit did not happen');
        });
      });
    });

    describe('::amend', () => {
      it('can amend changes with a message', () => {
        expectedArgs = ['amend', '-m', commitMessage];
        waitsForPromise(async () => {
          await hgService
            .amend(TEST_WORKING_DIRECTORY, commitMessage, AmendMode.CLEAN)
            .refCount()
            .toArray()
            .toPromise();
          expect(committedToHg).toBeTruthy('Looks like commit did not happen');
        });
      });

      it('can amend changes without a message', () => {
        expectedArgs = ['amend'];
        waitsForPromise(async () => {
          await hgService
            .amend(TEST_WORKING_DIRECTORY, null, AmendMode.CLEAN)
            .refCount()
            .toArray()
            .toPromise();
          expect(committedToHg).toBeTruthy('Looks like commit did not happen');
        });
      });

      it('can amend with --rebase & a commit message', () => {
        expectedArgs = ['amend', '--rebase', '-m', commitMessage];
        waitsForPromise(async () => {
          await hgService
            .amend(TEST_WORKING_DIRECTORY, commitMessage, AmendMode.REBASE)
            .refCount()
            .toArray()
            .toPromise();
          expect(committedToHg).toBeTruthy('Looks like commit did not happen');
        });
      });

      it('can amend with --fixup', () => {
        expectedArgs = ['amend', '--fixup'];
        waitsForPromise(async () => {
          await hgService
            .amend(TEST_WORKING_DIRECTORY, null, AmendMode.FIXUP)
            .refCount()
            .toArray()
            .toPromise();
          expect(committedToHg).toBeTruthy('Looks like commit did not happen');
        });
      });
    });
  });

  describe('::fetchMergeConflicts', () => {
    it('fetches rich merge conflict data', () => {
      let wasCalled = false;
      spyOn(hgUtils, 'hgRunCommand').andCallFake((args, options) => {
        wasCalled = true;
        return Observable.of(mockOutput);
      });
      waitsForPromise(async () => {
        const mergeConflictsEnriched = await hgService
          .fetchMergeConflicts(TEST_WORKING_DIRECTORY)
          .refCount()
          .toPromise();
        expect(wasCalled).toBeTruthy();
        expect(mergeConflictsEnriched).not.toBeNull();
        invariant(mergeConflictsEnriched != null);
        expect(mergeConflictsEnriched.conflicts.length).toBe(2);
        const conflicts = mergeConflictsEnriched.conflicts;
        expect(conflicts[0].status).toBe(MergeConflictStatus.BOTH_CHANGED);
        expect(conflicts[1].status).toBe(MergeConflictStatus.DELETED_IN_OURS);
      });
    });
  });

  describe('::fetchMergeConflicts()', () => {
    const relativePath1 = relativize(PATH_1);
    const relativePath2 = relativize(PATH_2);

    beforeEach(() => {
      spyOn(hgUtils, 'hgRunCommand').andReturn({
        stdout: JSON.stringify([
          {path: relativePath1, status: StatusCodeId.UNRESOLVED},
          {path: relativePath2, status: StatusCodeId.UNRESOLVED},
          {path: '/abc', status: 'something'},
        ]),
      });
    });
  });

  describe('::resolveConflictedFile()', () => {
    beforeEach(() => {
      spyOn(hgUtils, 'hgObserveExecution').andCallFake(path => {
        return Observable.empty();
      });
    });

    it('calls hg resolve', () => {
      waitsForPromise(async () => {
        await hgService
          .markConflictedFile(
            TEST_WORKING_DIRECTORY,
            PATH_1,
            /* resolved */ true,
          )
          .refCount()
          .toArray()
          .toPromise();
        expect(hgUtils.hgObserveExecution).toHaveBeenCalledWith(
          ['resolve', '-m', PATH_1],
          {cwd: TEST_WORKING_DIRECTORY},
        );
      });
    });
  });

  describe('::_checkConflictChange', () => {
    let mergeDirectoryExists;
    let hgRepoSubscriptions;

    beforeEach(() => {
      hgRepoSubscriptions = new HgService.HgRepositorySubscriptions(
        TEST_WORKING_DIRECTORY,
      );
      mergeDirectoryExists = false;
      spyOn(hgRepoSubscriptions, '_checkMergeDirectoryExists').andCallFake(
        () => {
          return mergeDirectoryExists;
        },
      );
    });

    it("reports no conflicts when the merge directory isn't there", () => {
      waitsForPromise(async () => {
        mergeDirectoryExists = false;
        await hgRepoSubscriptions._checkConflictChange();
        expect(hgRepoSubscriptions._isInConflict).toBeFalsy();
      });
    });

    // This is necessary especially when users need to run merge drivers to finish
    it('reports in conflict state even if no files have merge conflicts', () => {
      mergeDirectoryExists = true;
      waitsForPromise(async () => {
        await hgRepoSubscriptions._checkConflictChange();
        expect(hgRepoSubscriptions._isInConflict).toBeTruthy();
      });
    });

    it('reports conflicts when merge directory exists + conflicts found', () => {
      mergeDirectoryExists = true;
      waitsForPromise(async () => {
        await hgRepoSubscriptions._checkConflictChange();
        expect(hgRepoSubscriptions._isInConflict).toBeTruthy();
      });
    });

    it('exits of conflict state when the merge directory is removed', () => {
      mergeDirectoryExists = true;
      waitsForPromise(async () => {
        await hgRepoSubscriptions._checkConflictChange();
        expect(hgRepoSubscriptions._isInConflict).toBeTruthy();
        mergeDirectoryExists = false;
        await hgRepoSubscriptions._checkConflictChange();
        expect(hgRepoSubscriptions._isInConflict).toBeFalsy();
      });
    });
  });

  describe('::_disposeObserver', () => {
    it('should end published observables when disposed', () => {
      waitsForPromise({timeout: 1000}, async () => {
        const subject: Subject<Map<string, boolean>> = new Subject();
        const repoSubscriptions = new HgService.HgRepositorySubscriptions(
          TEST_WORKING_DIRECTORY,
        );
        repoSubscriptions._lockFilesDidChange = subject;

        const locksObservable = repoSubscriptions
          .observeLockFilesDidChange()
          .refCount()
          .toArray()
          .toPromise();
        const m1 = new Map([['hello', true]]);
        const m2 = new Map([['goodbye', false]]);
        subject.next(m1);
        subject.next(m2);
        repoSubscriptions.dispose();
        // after disposing, we shouldn't see any more emitted events
        subject.next(m1);
        subject.next(m2);
        // await goes through even though we never called subject.complete()
        const result = await locksObservable;
        expect(result).toEqual([m1, m2]);
      });
    });
  });
});
