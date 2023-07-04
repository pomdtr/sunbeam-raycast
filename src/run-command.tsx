import { LaunchProps } from "@raycast/api";
import { SunbeamPage } from "./sunbeam";

export default function RunCommand(props: LaunchProps<{ arguments: Arguments.RunCommand }>) {
  const { command } = props.arguments;

  return <SunbeamPage action={{ type: "push", command: `sunbeam ${command}` }} />;
}
