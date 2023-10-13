import {
  Action,
  ActionPanel,
  Detail,
  getPreferenceValues,
  List,
  useNavigation,
  LaunchProps,
  Form,
  Icon,
  Clipboard,
  open,
  closeMainWindow,
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

  async run(commandName: string, input: { params: Record<string, string | number | boolean> }) {
    const { stdout, exitCode, stderr } = await execa(shell, ["-lc", `sunbeam ${this.alias} ${commandName}`], {
      input: JSON.stringify(input)
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
  return <List.Item
    key={command.name}
    title={command.title}
    subtitle={extension.manifest.title}
    actions={<ActionPanel>
      <SunbeamAction action={{
        title: "Run Command",
        onAction: {
          type: "run",
          command: command.name,
        }
      }} extension={extension} />

    </ActionPanel>}
  />

}


function SunbeamPage(props: { extension: Extension, commandName: string; params: Record<string, string | number | boolean> }) {
  const [state, setState] = useState<{ page?: sunbeam.Page; isLoading: boolean }>({ isLoading: true });

  useEffect(() => {
    props.extension.run(props.commandName, { params: props.params }).then((page) => {
      setState({ page, isLoading: false });
    })
  }, []);

  if (!state.page) {
    return <Detail isLoading={state.isLoading} />;
  }

  switch (state.page.type) {
    case "list":
      return <SunbeamList extension={props.extension} list={state.page} />;
    case "detail":
      return <SunbeamDetail extension={props.extension} detail={state.page} />;
    case "form":
      return <SunbeamForm extension={props.extension} form={state.page} />;
  }
}

function SunbeamList(props: { extension: Extension; list: sunbeam.List }) {
  return (
    <List actions={
      <ActionPanel>
        {props.list.actions?.map((action, idx) => <SunbeamAction key={idx} action={action} extension={props.extension} />)}
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
                  <SunbeamAction key={idx} action={action} extension={props.extension} />
                ))}
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function SunbeamDetail(props: { extension: Extension; detail: sunbeam.Detail }) {
  return (
    <Detail
      markdown={props.detail.markdown}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {props.detail.actions?.map((action, idx) => (
              <SunbeamAction key={idx} action={action} extension={props.extension} />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function SunbeamForm(props: { extension: Extension; form: sunbeam.Form }): JSX.Element {
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={"Submit"}
          />
        </ActionPanel>
      }
    >
      {props.form.fields?.map((field) => {
        switch (field.input.type) {
          case "checkbox":
            return <Form.Checkbox key={field.name} id={field.name} title={field.title} label={field.input.label} />;
          case "select":
            return (
              <Form.Dropdown key={field.name} id={field.name} title={field.title}>
                {field.input.options.map((option, idx) => (
                  <Form.Dropdown.Item key={idx} title={option.title} value={option.value} />
                ))}
              </Form.Dropdown>
            );
          case "text":
            return <Form.TextField key={field.name} id={field.name} title={field.title} />;
          case "textarea":
            return <Form.TextArea key={field.name} id={field.name} title={field.title} />;
        }
      })}
    </Form>
  );
}

function actionIcon(action: sunbeam.Action) {
  switch (action.onAction.type) {
    case "copy":
      return Icon.Clipboard;
    case "open":
      return Icon.Globe;
    case "run":
      return Icon.Play;
  }
}

function SunbeamAction({ action, extension }: { action: sunbeam.Action; extension: Extension }) {
  const navigation = useNavigation();
  async function runAction(action: sunbeam.Action) {
    switch (action.onAction.type) {
      case "copy":
        Clipboard.copy(action.onAction.text);
        if (action.onAction.exit) {
          await closeMainWindow();
        }
        return;
      case "open":
        open(action.onAction.target);
        if (action.onAction.exit) {
          await closeMainWindow();
        }
        return;
      case "run": {
        const commandName = action.onAction.command;
        const commandParams = action.onAction.params;
        const command = extension.command(commandName);
        if (!command) {
          throw new Error(`Command not found: ${commandName}`);
        }
        switch (command.mode) {
          case "view": {
            navigation.push(
              <SunbeamPage extension={extension} commandName={commandName} params={commandParams || {}} />
            );
            return;
          }
          case "no-view": {
            const outputAction = await extension.run(commandName, { params: commandParams || {} });
            if (!outputAction) {
              throw new Error("Expected action");
            }
            if (outputAction.type === "list" || outputAction.type == "detail" || outputAction.type === "form") {
              throw new Error("Expected action");
            }

            if (outputAction.type === "run") {
              throw new Error("Nested run commands are not supported");
            }
            await runAction(outputAction);
            return;
          }
        }
      }
    }
  }
  return (
    <Action
      title={action.title}
      icon={actionIcon(action)}
      onAction={() => runAction(action)}
    />
  );
}