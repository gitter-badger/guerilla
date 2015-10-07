/*
 * Guerilla
 * Copyright 2015, Yahoo Inc.
 * Copyrights licensed under the MIT License.
 *
 * Checks out a project from GitHub using repo.
 */

var async = require('async');
var path = require('path');

module.exports.validate = function validate () {
	return {
		params: {
			checkout_url: 'required',
			branch: 'optional',
			project_root: 'optional',
			manifest_file: 'optional'
		}
	};
};

module.exports.execute = function execute (params, context, exec, callback) {
	var output = {};
	context.checkout_root = path.join(context.working_dir, 'project');
	context.project_root = params.project_root ? path.join(context.checkout_root, params.project_root) : context.checkout_root;

	var repoCmd = path.join(context.bin_dir, 'repo', 'repo');

	async.series([
		function (cb) {
			var cmd = 'mkdir';

			var args = [];
			args.push('-p');
			args.push(context.checkout_root);

			exec(cmd, args, {}, cb);
		},
		function (cb) {
			var args = [];
			args.push('init');
			args.push('-u');
			args.push(params.checkout_url);
			if (params.branch) {
				args.push('-b');
				args.push(params.branch);
			}
			if (params.manifest_file) {
				args.push('-m');
				args.push(params.manifest_file);
			}

			var options = { cwd: context.checkout_root };

			exec(repoCmd, args, options, cb);
		},
		function (cb) {
			var args = [];
			args.push('sync');
			args.push('-d');
			args.push('-c');
			args.push('--jobs=4');

			var options = { cwd: context.checkout_root };

			exec(repoCmd, args, options, cb);
		},
		function (cb) {
			var cmd = 'git';

			var args = [];
			args.push('rev-parse');
			args.push('HEAD');

			function stdout (data) {
				if (data.length === 41)
					output.version = data.trim();
			}

			var options = { stdout: stdout, cwd: context.project_root };

			exec(cmd, args, options, function () {
				cb();
			});
		}
	], function (error) {
		callback(error, output);
	});
};