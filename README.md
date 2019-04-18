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
