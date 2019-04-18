## Configuration

The following formatting options are supported:

| Name           | Default      | Description                                                                                     |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `printWidth`   | `80`         | Same as in Prettier ([see prettier docs](https://prettier.io/docs/en/options.html#print-width)) |

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
