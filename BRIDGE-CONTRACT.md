# Bridge API: Viewer

API extension `@ohif/extension-viewer-bridge` для обміну з `host-app` через `window.postMessage`.

## Protocol

```ts
type BridgeMessage<TType extends string, TPayload> = {
  version: 1;
  type: TType;
  payload: TPayload;
};

type ViewerToolName = 'EllipticalROI' | 'Length';

type Metric = {
  value: number;
  unit: string;
};
```

## Input: Host -> Viewer

| Type                   | Payload               | OHIF command                                  |
| ---------------------- | --------------------- | --------------------------------------------- |
| `REQUEST_VIEWER_READY` | `{}`                  | Відповідає `VIEWER_READY`, якщо Viewer готовий |
| `ACTIVATE_TOOL`        | `{ rowId, toolName }` | `setToolActive`                               |
| `DEACTIVATE_TOOL`      | `{ rowId }`           | Активує `Pan`                                 |
| `FOCUS_MEASUREMENT`    | `{ annotationId }`    | `jumpToMeasurement`                           |
| `DELETE_MEASUREMENT`   | `{ annotationId }`    | `removeMeasurement`                           |

## Output: Viewer -> Host

| Type                  | Payload                   | OHIF event            |
| --------------------- | ------------------------- | --------------------- |
| `VIEWER_READY`        | `{}`                      | `VIEWPORTS_READY`     |
| `MEASUREMENT_ADDED`   | `MeasurementPayload`      | `MEASUREMENT_ADDED`   |
| `MEASUREMENT_UPDATED` | `MeasurementPayload`      | `MEASUREMENT_UPDATED` |
| `MEASUREMENT_REMOVED` | `{ rowId, annotationId }` | `MEASUREMENT_REMOVED` |

```ts
type MeasurementPayload = {
  rowId: string;
  annotationId: string;
  toolName: ViewerToolName;
  metric: Metric;
};
```
