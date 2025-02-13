import { ActionPanel, getPreferenceValues, LaunchProps, List } from "@raycast/api";
import { showFailureToast, useExec, useFrecencySorting } from "@raycast/utils"
import * as sunbeam from "@pomdtr/sunbeam"
import { findMissingParams, SunbeamAction, SunbeamDetail, SunbeamForm, SunbeamList } from "./components.tsx";

const preferences = getPreferenceValues<Preferences>();

export default function (props: LaunchProps<{
  arguments: Arguments.RunCommand, launchContext: {
    params: sunbeam.Params
  }
}>) {
  const { data, isLoading } = useExec("sunbeam", {
    env: {
      PATH: preferences.PATH,
    },
    parseOutput: (output) => {
      if (output.exitCode === null) {
        return
      }

      if (output.exitCode !== 0) {
        showFailureToast(output.stderr)
        return
      }

      return JSON.parse(output.stdout) as sunbeam.Extension[]
    },
  })


  if (props.arguments.extension && props.arguments.command) {
    const extension = data?.find((extension) => extension.name === props.arguments.extension)
    if (!extension) {
      return <List isLoading={isLoading} />
    }
    const command = extension?.commands?.find((command) => command.name === props.arguments.command)
    if (!command) {
      return <List isLoading={isLoading} />
    }

    const missing = findMissingParams(command, props.launchContext?.params || {})
    if (missing.length > 0) {
      return <SunbeamForm extension={extension} command={command} params={props.launchContext?.params} />
    }

    if (command.mode === "silent") {
      showFailureToast("Command is not interactive")
      return <List isLoading={isLoading} />
    }

    return command.mode === "detail" ? <SunbeamDetail command={command} extension={extension} params={props.launchContext?.params} /> : <SunbeamList command={command} extension={extension} params={props.launchContext?.params} />
  }

  const { data: items, visitItem } = useFrecencySorting(
    data?.filter((extension) => {
      if (!props.arguments.extension) {
        return true
      }

      return extension.name === props.arguments.extension
    }).flatMap((extension) => (extension.actions || []).map((action, idx) => ({ id: `${extension.name}:${idx}`, action, extension })))
  )

  return (
    <List isLoading={isLoading}>
      {items?.map(item => (
        <List.Item
          key={item.id}
          title={item.action.title}
          keywords={[item.extension.title, item.extension.name]}
          subtitle={item.extension.title}
          accessories={[{ text: item.extension.name }]}
          actions={
            <ActionPanel>
              <SunbeamAction action={{ ...item.action, title: "Run", }} extension={item.extension} onAction={() => visitItem(item)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
};

