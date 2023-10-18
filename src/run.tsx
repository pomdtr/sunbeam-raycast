import {
  Action,
  ActionPanel,
  Detail,
  getPreferenceValues,
  List,
  LaunchProps,
  showToast,
  Toast,
  useNavigation,
  Clipboard,
  closeMainWindow,
  open,
} from "@raycast/api";
import * as sunbeam from "sunbeam-types";
import { useEffect, useState } from "react";
import { execa } from "execa";

const preferences = getPreferenceValues<Preferences>();
const shell = preferences.shell || process.env.SHELL || "/bin/zsh";

async function loadExtension() {
  const { exitCode, stdout, stderr } = await execa(shell, ["-lc", "sunbeam"])
  if (exitCode !== 0) {
    throw new Error(stderr);
  }

  const extensions = JSON.parse(stdout) as Record<string, sunbeam.Manifest>;

  return Object.entries(extensions).map(([alias, manifest]) => new Extension(alias, manifest));
}

class Extension {
  public alias: string;
  public manifest: sunbeam.Manifest;

  constructor(alias: string, manifest: sunbeam.Manifest) {
    this.alias = alias;
    this.manifest = manifest;
  }

  static async load(alias: string) {
    const { stdout, exitCode, stderr } = await execa(shell, ["-lc", `sunbeam ${alias}`])
    if (exitCode !== 0) {
      throw new Error(stderr);
    }

    const manifest = JSON.parse(stdout) as sunbeam.Manifest;
    return new Extension(alias, manifest);
  }

  async run(commandName: string, input: { params: Record<string, string | number | boolean>, query?: string }) {
    const { stdout, exitCode, stderr } = await execa(shell, ["-lc", `sunbeam ${this.alias} ${commandName}`], {
      input: JSON.stringify({
        ...input,
        cwd: process.env.HOME
      })
    })

    if (exitCode !== 0) {
      throw new Error(stderr);
    }

    return JSON.parse(stdout)
  }

  command(commandName: string) {
    return this.manifest.commands.find(command => command.name === commandName)
  }

  get rootCommands() {
    return this.manifest?.commands.filter(command => {
      if (command.hidden) {
        return false
      }
      for (const param of command.params || []) {
        if (param.required) {
          return false
        }
      }

      return true
    })
  }
}

export default function Sunbeam(props: LaunchProps<{ arguments: Arguments.Run }>) {
  if (props.arguments.alias) {
    return <SunbeamExtension alias={props.arguments.alias} />;
  }

  return <SunbeamRoot />;
}

function SunbeamRoot() {
  const [{ extensions, isLoading }, setState] = useState<{ extensions: Extension[]; isLoading: boolean }>({ extensions: [], isLoading: true });

  useEffect(() => {
    loadExtension().then((extensions) => {
      setState({ extensions, isLoading: false })
    }).catch((err) => {
      showToast(Toast.Style.Failure, "Failed to load extensions", err);
      setState({ extensions: [], isLoading: false })
    })
  }, [])

  const commands = extensions.flatMap(extension => extension.rootCommands.map(command => ({
    extension,
    command
  })))

  return <List isLoading={isLoading}>
    {commands.map(({ command, extension }, idx) => <SunbeamCommand key={idx} extension={extension} command={command} />)}
  </List>
}

function SunbeamExtension(props: { alias: string }) {
  const [{ extension, isLoading }, setState] = useState<{
    extension?: Extension;
    isLoading: boolean;
  }>({ isLoading: true });

  useEffect(() => {
    Extension.load(props.alias).then((extension) => {
      setState({ extension, isLoading: false });
    }).catch((err) => {
      showToast(Toast.Style.Failure, "Failed to load extension", err);
      setState({ isLoading: false });
    })
  }, []);

  return (
    <List isLoading={isLoading}>
      {extension?.rootCommands?.map(command => (
        <SunbeamCommand key={command.name} extension={extension} command={command} />
      ))}
    </List>
  );
}

function SunbeamCommand({ extension, command }: { extension: Extension; command: sunbeam.CommandSpec }) {
  const navigation = useNavigation();
  return <List.Item
    key={command.name}
    title={command.title}
    subtitle={extension.manifest.title}
    accessories={[{ text: extension.alias }]}
    actions={<ActionPanel>
      <Action title="Run Command" onAction={() => runAction({ type: "run", command: command.name }, extension, navigation.push)} />
    </ActionPanel>}
  />

}

async function runAction(onAction: sunbeam.Command, extension: Extension, push: (jsx: JSX.Element) => void) {
  switch (onAction.type) {
    case "copy":
      Clipboard.copy(onAction.text);
      if (onAction.exit) {
        await closeMainWindow();
      }
      return;
    case "open":
      open(onAction.target, onAction.app?.mac)
      if (onAction.exit) {
        await closeMainWindow();
      }
      return;
    case "exit":
      await closeMainWindow();
      return;
    case "run": {
      const { command: name, params } = onAction

      const target = extension.command(name);
      if (!target) {
        throw new Error("Command not found");
      }
      switch (target.mode) {
        case "view": {
          push(
            <SunbeamPage extension={extension} commandName={name} params={params || {}} />
          );
          return;
        }
        case "no-view": {
          const outputAction = await extension.run(name, { params: params || {} });
          if (!outputAction) {
            return;
          }

          await runAction(outputAction, extension, push);
        }
      }
    }
  }
}



function SunbeamPage(props: { extension: Extension, commandName: string; params: Record<string, string | number | boolean> }) {
  const [state, setState] = useState<{ page?: sunbeam.Page; isLoading: boolean }>({ isLoading: true });

  const navigation = useNavigation()

  const reload = async (query?: string) => {
    setState({ ...state, isLoading: true });
    try {
      const page = await props.extension.run(props.commandName, { params: props.params, query })
      setState({ page, isLoading: false });
    } catch (err: any) {
      showToast(Toast.Style.Failure, "Failed to load page", err);
      setState({ isLoading: false });
    }
  }

  useEffect(() => {
    reload()
  }, []);

  if (!state.page) {
    return <Detail isLoading={state.isLoading} />;
  }

  switch (state.page.type) {
    case "list":
      return <SunbeamList isLoading={state.isLoading} list={state.page} onAction={(action) => runAction(action.onAction, props.extension, navigation.push)} reload={reload} />;
    case "detail":
      return <SunbeamDetail detail={state.page} onAction={(action) => runAction(action.onAction, props.extension, navigation.push)} />;
  }
}

function SunbeamList(props: { isLoading: boolean, list: sunbeam.List, onAction: (action: sunbeam.Action) => void, reload: (query?: string) => void }) {
  return (
    <List isLoading={props.isLoading} throttle onSearchTextChange={props.list.dynamic ? props.reload : undefined} actions={
      <ActionPanel>
        {props.list.actions?.map((action, idx) => <Action key={idx} title={action.title} onAction={() => props.onAction(action)} />)}
      </ActionPanel>
    }>
      {props.list.emptyText && (
        <List.EmptyView
          title={props.list.emptyText}
        />
      )}
      {props.list.items.map((item, idx) => (
        <List.Item
          key={idx}
          title={item.title}
          subtitle={item.subtitle}
          accessories={item.accessories?.map((accessory) => ({ text: accessory }))}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                {item.actions?.map((action, idx) => (
                  <Action key={idx} title={action.title} onAction={() => props.onAction(action)} />
                ))}
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function SunbeamDetail(props: { detail: sunbeam.Detail, onAction: (action: sunbeam.Action) => void }) {
  return (
    <Detail
      markdown={props.detail.markdown}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {props.detail.actions?.map((action, idx) => (
              <Action key={idx} title={action.title} onAction={() => props.onAction(action)} />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
