/**
 * © 2017 Liferay, Inc. <https://liferay.com>
 *
 * SPDX-License-Identifier: MIT
 */

const {
	getLeadingComments,
	getRequireStatement,
	getSource,
	hasSideEffects,
	isLocal,
} = require('../common/imports');

const DESCRIPTION = 'imports must be grouped';

module.exports = {
	create(context) {
		const imports = [];

		const scope = [];

		const enterScope = node => scope.push(node);
		const exitScope = () => scope.pop();

		function expectBlankLines(node, count = 1) {
			const comments = getLeadingComments(node, context);
			const initial = comments[0] || node;
			const token = context.getTokenBefore(initial, {
				includeComments: true,
			});

			if (token) {
				const source = context.getSourceCode();

				const start = token.range[1];
				const end = initial.range[0];

				const between = source.text.slice(start, end);

				const newlines = [];

				between.replace(/(?:\r\n|\n)[ \t]*/g, match => {
					newlines.push(match);
					return match;
				});

				const blankLines = Math.max(newlines.length - 1, 0);

				if (blankLines === count) {
					return;
				}

				const [first, ...rest] = newlines;

				let fixed;
				let problem;

				if (blankLines < count) {
					fixed = ['\n' + (first || ''), ...rest].join('');
					problem = 'expected';
				} else if (blankLines > count) {
					fixed = newlines.slice(blankLines - count).join('');
					problem = 'unexpected';
				} else {
					return;
				}

				const message =
					`${DESCRIPTION} ` +
					`(${problem} blank line before: ${JSON.stringify(
						getSource(node)
					)})`;

				context.report({
					fix: fixer => {
						return fixer.replaceTextRange([start, end], fixed);
					},
					message,
					node,
				});
			}
		}

		function register(node) {
			if (node) {
				imports.push(node);
			}
		}

		return {
			ArrowFunctionExpression: enterScope,
			'ArrowFunctionExpression:exit': exitScope,

			BlockStatement: enterScope,
			'BlockStatement:exit': exitScope,

			CallExpression(node) {
				if (scope.length) {
					// Only consider `require` calls at the top level.
					return;
				}

				register(getRequireStatement(node));
			},

			FunctionDeclaration: enterScope,
			'FunctionDeclaration:exit': exitScope,

			FunctionExpression: enterScope,
			'FunctionExpression:exit': exitScope,

			ImportDeclaration(node) {
				register(node);
			},

			ObjectExpression: enterScope,
			'ObjectExpression:exit': exitScope,

			['Program:exit'](_node) {
				/**
				 * Check each import for 5 possible reasons for
				 * requiring a blank line:
				 *
				 * 1. Import is first in the file.
				 * 2. Import has side effects.
				 * 3. Import is preceded by a non-import.
				 * 4. Import starts a new group.
				 * 5. Import is preceded by a leading, non-header comment.
				 *
				 * For everything else, disallow a blank line.
				 */
				for (let i = 0; i < imports.length; i++) {
					if (i === 0) {
						expectBlankLines(imports[0]);
						continue;
					}

					const current = imports[i];

					if (hasSideEffects(current)) {
						expectBlankLines(current);
						continue;
					}

					const previous = imports[i - 1];
					const token = context.getTokenBefore(current);
					const last = context.getNodeByRangeIndex(token.range[0]);

					if (last !== previous) {
						expectBlankLines(current);
						continue;
					}

					const currentSource = getSource(current);
					const previousSource = getSource(previous);

					const changed =
						isLocal(currentSource) ^ isLocal(previousSource);

					if (changed) {
						expectBlankLines(current);
						continue;
					}
					const comments = getLeadingComments(current, context);

					if (comments.length) {
						expectBlankLines(current);
						continue;
					}

					expectBlankLines(current, 0);
				}
			},
		};
	},

	meta: {
		docs: {
			category: 'Best Practices',
			description: DESCRIPTION,
			recommended: false,
			url:
				'https://github.com/liferay/liferay-frontend-guidelines/issues/60',
		},
		fixable: 'code',
		schema: [],
		type: 'problem',
	},
};
