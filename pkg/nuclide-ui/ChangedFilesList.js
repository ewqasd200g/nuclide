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

import type {NuclideUri} from 'nuclide-commons/nuclideUri';
import type {GeneratedFileType} from '../nuclide-generated-files-rpc';
import type {FileChangeStatusValue} from '../nuclide-vcs-base';

import {repositoryForPath} from '../nuclide-vcs-base';
import addTooltip from 'nuclide-commons-ui/addTooltip';
import classnames from 'classnames';
import nuclideUri from 'nuclide-commons/nuclideUri';
import nullthrows from 'nullthrows';
import * as React from 'react';
import ChangedFile from './ChangedFile';

function isHgPath(path: NuclideUri): boolean {
  const repo = repositoryForPath(path);
  return repo != null && repo.getType() === 'hg';
}

// Computes the minimally differentiable display path for each file.
// The algorithm is O(n*m^2) where n = filePaths.length and m = maximum number
// parts in a given path and the implementation is semi-optimized for
// performance.
//
// ['/a/b/c.js', '/a/d/c.js'] would return ['b/c.js', 'd/c.js']
// ['/a/b/c.js', '/a/b/d.js'] would return ['c.js', 'd.js']
// ['/a/b.js', '/c/a/b.js'] would return ['/a/b.js', 'c/a/b.js']
export function computeDisplayPaths(
  filePaths: Array<NuclideUri>,
  maxDepth: number = 5,
): Array<string> {
  const displayPaths = filePaths.map(path => {
    const separator = nuclideUri.pathSeparatorFor(path);
    return {
      separator,
      pathParts: path.split(separator).reverse(),
      depth: 1,
      done: false,
    };
  });

  let seenCount: {[NuclideUri]: number} = {};
  let currentDepth = 1;
  let toProcess = displayPaths;
  while (currentDepth < maxDepth && toProcess.length > 0) {
    // Compute number of times each display path is seen.
    toProcess.forEach(({pathParts, depth}) => {
      const path = pathParts.slice(0, depth).join('/');
      if (seenCount[path] == null) {
        seenCount[path] = 1;
      } else {
        seenCount[path]++;
      }
    });

    // Mark the display paths seen exactly once as done.
    // Increment the depth otherwise.
    toProcess.forEach(displayPath => {
      const {depth, pathParts} = displayPath;
      const path = pathParts.slice(0, depth).join('/');

      if (seenCount[path] === 1 || depth === pathParts.length) {
        displayPath.done = true;
      } else {
        displayPath.depth++;
      }
    });

    toProcess = toProcess.filter(displayPath => !displayPath.done);
    seenCount = {};
    currentDepth++;
  }

  return displayPaths.map(({separator, pathParts, depth}) =>
    pathParts
      .slice(0, depth)
      .reverse()
      .join(separator),
  );
}

const FILE_CHANGES_INITIAL_PAGE_SIZE = 100;

type Props = {
  // List of files that have checked checkboxes next to their names. `null` -> no checkboxes
  checkedFiles: ?Set<NuclideUri>,
  commandPrefix: string,
  // whether files can be expanded to reveal a diff of changes. Requires passing `fileChanges`.
  enableFileExpansion: boolean,
  enableInlineActions: boolean,
  fileStatuses: Map<NuclideUri, FileChangeStatusValue>,
  generatedTypes?: Map<NuclideUri, GeneratedFileType>,
  hideEmptyFolders: boolean,
  onAddFile: (filePath: NuclideUri) => void,
  onDeleteFile: (filePath: NuclideUri) => void,
  // Callback when a file's checkbox is toggled
  onFileChecked: (filePath: NuclideUri) => void,
  // Call back when a file is clicked on
  onFileChosen: (filePath: NuclideUri) => void,
  onForgetFile: (filePath: NuclideUri) => void,
  onMarkFileResolved?: (filePath: NuclideUri) => void,
  onOpenFileInDiffView: (filePath: NuclideUri) => void,
  onRevertFile: (filePath: NuclideUri) => void,
  openInDiffViewOption: boolean,
  rootPath: NuclideUri,
  selectedFile: ?NuclideUri,
  shouldShowFolderName: boolean,
};

type State = {
  isCollapsed: boolean,
  visiblePagesCount: number,
};

export default class ChangedFilesList extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      isCollapsed: false,
      visiblePagesCount: 1,
    };
  }

  render(): React.Node {
    const {
      checkedFiles,
      commandPrefix,
      enableFileExpansion,
      enableInlineActions,
      fileStatuses,
      generatedTypes,
      onAddFile,
      onDeleteFile,
      onFileChecked,
      onFileChosen,
      onForgetFile,
      onMarkFileResolved,
      onOpenFileInDiffView,
      openInDiffViewOption,
      onRevertFile,
      rootPath,
      selectedFile,
    } = this.props;
    if (fileStatuses.size === 0 && this.props.hideEmptyFolders) {
      return null;
    }

    const filesToShow =
      FILE_CHANGES_INITIAL_PAGE_SIZE * this.state.visiblePagesCount;
    const filePaths = Array.from(fileStatuses.keys()).slice(0, filesToShow);
    const displayPaths = computeDisplayPaths(filePaths);
    const sizeLimitedFileChanges = filePaths
      .map((filePath, index) => {
        const generatedType =
          generatedTypes != null ? generatedTypes.get(filePath) : null;
        return {
          filePath,
          displayPath: displayPaths[index],
          fileStatus: nullthrows(fileStatuses.get(filePath)),
          generatedType,
        };
      })
      .sort((change1, change2) =>
        nuclideUri
          .basename(change1.filePath)
          .localeCompare(nuclideUri.basename(change2.filePath)),
      );

    const rootClassName = classnames('list-nested-item', {
      collapsed: this.state.isCollapsed,
    });

    const showMoreFilesElement =
      fileStatuses.size > filesToShow ? (
        <div
          className="icon icon-ellipsis"
          // eslint-disable-next-line nuclide-internal/jsx-simple-callback-refs
          ref={addTooltip({
            title: 'Show more files with uncommitted changes',
            delay: 300,
            placement: 'bottom',
          })}
          onClick={() =>
            this.setState({
              visiblePagesCount: this.state.visiblePagesCount + 1,
            })
          }
        />
      ) : null;

    const isHgRoot = isHgPath(rootPath);
    return (
      <ul className="list-tree has-collapsable-children nuclide-changed-files-list">
        <li className={rootClassName}>
          {this.props.shouldShowFolderName ? (
            <div
              className="list-item"
              key={this.props.rootPath}
              onClick={() =>
                this.setState({isCollapsed: !this.state.isCollapsed})
              }>
              <span
                className="icon icon-file-directory nuclide-file-changes-root-entry"
                data-path={this.props.rootPath}>
                {nuclideUri.basename(this.props.rootPath)}
              </span>
            </div>
          ) : null}
          <ul className="list-tree has-flat-children">
            {sizeLimitedFileChanges.map(
              ({displayPath, filePath, fileStatus, generatedType}) => {
                return (
                  <ChangedFile
                    commandPrefix={commandPrefix}
                    displayPath={displayPath}
                    enableFileExpansion={enableFileExpansion}
                    enableInlineActions={enableInlineActions}
                    filePath={filePath}
                    fileStatus={fileStatus}
                    generatedType={generatedType}
                    isChecked={
                      checkedFiles == null ? null : checkedFiles.has(filePath)
                    }
                    isHgPath={isHgRoot}
                    isSelected={selectedFile === filePath}
                    key={filePath}
                    onAddFile={onAddFile}
                    onDeleteFile={onDeleteFile}
                    onFileChecked={onFileChecked}
                    onFileChosen={onFileChosen}
                    onForgetFile={onForgetFile}
                    onMarkFileResolved={onMarkFileResolved}
                    onOpenFileInDiffView={onOpenFileInDiffView}
                    openInDiffViewOption={openInDiffViewOption}
                    onRevertFile={onRevertFile}
                    rootPath={rootPath}
                  />
                );
              },
            )}
            <li>{showMoreFilesElement}</li>
          </ul>
        </li>
      </ul>
    );
  }
}
