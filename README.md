<div align="center">
  <img alt="Prettier" src="https://raw.githubusercontent.com/prettier/prettier-logo/master/images/prettier-icon-light.png">
  <img alt="CoffeeScript" height="184" width="220" hspace="44" vspace="15" src="https://cdn.worldvectorlogo.com/logos/coffeescript.svg">
</div>

<h2 align="center">Prettier CoffeeScript Plugin</h2>

<p align="center">
  <a href="https://travis-ci.org/com/helixbass/prettier-plugin-coffeescript/">
    <img alt="Travis" src="https://img.shields.io/travis/com/helixbass/prettier-plugin-coffeescript.svg">
  </a>
  <a href="https://www.npmjs.com/package/prettier-plugin-coffeescript">
    <img alt="npm version" src="https://img.shields.io/npm/v/prettier-plugin-coffeescript.svg?style=flat-square">
  </a>
  <a href="#badge">
    <img alt="code style: prettier" src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square">
  </a>
</p>

[Prettier](https://prettier.io) is an opinionated code formatter. It enforces a consistent style by parsing your code and re-printing it with its own rules that take the maximum line length into account, wrapping code when necessary

This plugin adds support for the [CoffeeScript](https://coffeescript.org) language to Prettier

## Install
This plugin currently requires forked versions of CoffeeScript (but the necessary AST support is landing soon) and Prettier (in order to support things like implicit calls and objects, new Prettier primitives are required - [here's the PR](https://github.com/prettier/prettier/pull/4462))

So the best way to ensure that the required dependencies are available to the plugin is to explicitly install them in your project along with the plugin:

yarn:

```bash
# yarn seems to occasionally get confused by Github dependencies, so I'd recommend clearing your lockfile first
rm yarn.lock
# then explicitly install the dependencies and the plugin
yarn add --dev github:helixbass/coffeescript#256af8b9 github:helixbass/prettier#72ae1f97 prettier-plugin-coffeescript
```

npm:

```bash
# npm also seems to occasionally get confused by Github dependencies, so I'd recommend clearing your lockfile first
rm package-lock.json
# then explicitly install the dependencies and the plugin
npm install --save-dev github:helixbass/coffeescript#256af8b9 github:helixbass/prettier#72ae1f97 prettier-plugin-coffeescript
```

## Usage

To run Prettier manually, you can add prettier as a script in your `package.json`,

```json
{
  "scripts": {
    "prettier": "prettier"
  }
}
```

and then run it via

```bash
yarn run prettier path/to/file.coffee --write
# or
npm run prettier -- path/to/file.coffee --write
```

In practice, there are various ways to run Prettier:
- most editors can be configured to run Prettier automatically
- Prettier can be configured to run via a linter like ESLint
- you can enforce the usage of Prettier by having it run automatically before committing code

The "Usage" section of the [Prettier docs](https://prettier.io/docs/en/precommit.html) describes how to set these up

## Configuration

The following formatting options are supported:

| Name           | Default      | Description                                                                                     |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `printWidth`   | `80`         | Same as in Prettier ([see prettier docs](https://prettier.io/docs/en/options.html#print-width)) |
| `tabWidth`      | `2`       | Same as in Prettier ([see prettier docs](https://prettier.io/docs/en/options.html#tab-width)) |
| `singleQuote`   | `true`    | If set to `true`, non-interpolated strings/heredocs will prefer single quotes (`'abc'`/`'''I'm a heredoc'''`) |
| `comma`         | `none`    | Applies to multiline arrays/calls/function params/explicit objects <br> If set to `none`, no commas will be used <br> If set to `nonTrailing`, commas will be added after non-last items <br> If set to `all`, commas will be added after all items <br> **:warning: Warning :warning:** Using `nonTrailing`/`all` is not yet well-supported, you may encounter formatting bugs |
| `noImplicit`    | `[]`      | If includes `callParens`, call parentheses will always be explicitly included <br> If includes `objectBraces`, object braces will always be explicitly included |
| `respectExplicit` | `[]`    | If includes `callParens`, explicit call parentheses in the original source will be preserved <br> If includes `objectBraces`, explicit object braces in the original source will be preserved |
| `respectBreak`    | `['control', 'functionBody', 'object']` | Applies to multiline structures in the original source <br> If includes `control`, the formatter will not attempt to inline multiline control structures (`if`/`unless`/`for`/`while`/`until`/`try`) <br> If includes `functionBody`, the formatter will not attempt to inline functions with indented bodies <br> If includes `object`, the formatter will not attempt to inline multiline objects (similar to Prettier JS formatter) |
| `inlineAssignmentsTo` | `['control']` | If includes `control`, will attempt to inline assignments of control structures |
| `emptyParamListParens` | `false`      | If set to `true`, functions with an empty param list will include an empty pair of parentheses eg `() -> a` |
| `indentChain`         | `false`       | If set to `true`, multiline chained method calls will be indented with respect to the first line of the chain <br> **:warning: Warning :warning:** Setting `indentChain: true` can currently cause broken formatting in some [edge cases](https://github.com/helixbass/prettier-plugin-coffeescript/issues/54) |

Any of these can be added to an existing or new [Prettier configuration
file](https://prettier.io/docs/en/configuration.html). For example:

```json
{
  "respectExplicit": ["objectBraces"],
}
```

## Help / Contributing / Feedback

Please file an issue or submit a pull request on [Github](https://github.com/helixbass/prettier-plugin-coffeescript) with any bugs/questions/suggestions

If you're interested in contributing to the development of this plugin, [Prettier's CONTRIBUTING guide](https://github.com/prettier/prettier/blob/master/CONTRIBUTING.md) may be helpful

To get started:

- Clone this repository
- Run `yarn install`
- Create a `test.coffee` file
- Run `yarn prettier test.coffee` to check the output
- You can adjust the project's `.prettierrc` file to temporarily adjust formatting options when running manually
- Run `yarn test` while developing to see if any formatting snapshots have changed
- To update the stored snapshots, run `yarn test -u`
- Add new snapshot tests under `tests/`. New subdirectories need a `jsfmt.spec.js` file, where you can specify multiple different formatting option configurations for those snapshots if desired

## License

MIT
