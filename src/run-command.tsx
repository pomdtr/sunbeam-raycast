import { ActionPanel, getPreferenceValues, LaunchProps, List } from "@raycast/api";
import { useFetch, useFrecencySorting } from "@raycast/utils"
import * as sunbeam from "@pomdtr/sunbeam"
import { SunbeamAction } from "./components.tsx";

const preferences = getPreferenceValues<Preferences>();

export default function (props: LaunchProps<{ arguments: Arguments.RunCommand }>) {
  const { data, isLoading } = useFetch<sunbeam.Extension[]>(new URL("/extensions", preferences.url).href)

  const { data: items, visitItem } = useFrecencySorting(
    data?.filter((extension) => {
      if (!props.arguments.extension) {
        return true
      }

      return extension.name === props.arguments.extension
    }).flatMap((extension) => (extension.root || []).map((action, idx) => ({ id: `${extension.name}:${idx}`, action, extension })))
  )

  return (
    <List isLoading={isLoading}>
      {items?.map(item => (
        <List.Item
          key={item.id}
          title={item.action.title}
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

