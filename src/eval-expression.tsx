import { SunbeamPage } from "./sunbeam";

export default function (props: { arguments: Arguments.EvalExpression }) {
  return (
    <SunbeamPage
      action={{
        type: "eval",
        expression: props.arguments.expression,
      }}
    />
  );
}
