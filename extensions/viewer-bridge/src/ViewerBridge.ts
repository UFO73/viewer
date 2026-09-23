import {
  BRIDGE_PROTOCOL_VERSION,
  hostToViewerMessageSchema,
  type ViewerToHostMessage,
} from './contract';
import { BridgeMessageType, type MeasurementMessageType } from './constants';

type ActiveMeasurement = {
  rowId: string;
  toolName: 'EllipticalROI';
};

type Measurement = {
  uid?: string;
  toolName?: string;
  data?: Record<string, unknown>;
};

type MeasurementEvent = {
  measurement?: Measurement;
};

type Subscription = {
  unsubscribe: () => void;
};

type MeasurementService = {
  EVENTS: {
    MEASUREMENT_ADDED: string;
    MEASUREMENT_UPDATED: string;
  };
  subscribe: (event: string, callback: (event: MeasurementEvent) => void) => Subscription;
};

type ViewportGridService = {
  EVENTS: {
    VIEWPORTS_READY: string;
  };
  subscribe: (event: string, callback: () => void) => Subscription;
};

export type ViewerBridgeOptions = {
  commandsManager: {
    runCommand: (commandName: string, options: { toolName: string }, context?: string) => unknown;
  };
  servicesManager: {
    services: {
      measurementService: MeasurementService;
      viewportGridService: ViewportGridService;
    };
  };
  hostOrigin: string;
};

export class ViewerBridge {
  private readonly subscriptions: Subscription[];
  private activeMeasurement: ActiveMeasurement | null = null;
  private readonly rowIdByAnnotationId = new Map<string, string>();
  private readySent = false;

  constructor(private readonly options: ViewerBridgeOptions) {
    const { measurementService, viewportGridService } = options.servicesManager.services;

    window.addEventListener('message', this.handleMessage);

    this.subscriptions = [
      measurementService.subscribe(
        measurementService.EVENTS.MEASUREMENT_ADDED,
        this.handleMeasurementAdded
      ),
      measurementService.subscribe(
        measurementService.EVENTS.MEASUREMENT_UPDATED,
        this.handleMeasurementUpdated
      ),
      viewportGridService.subscribe(viewportGridService.EVENTS.VIEWPORTS_READY, this.sendReady),
    ];
  }

  destroy() {
    window.removeEventListener('message', this.handleMessage);
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
    this.rowIdByAnnotationId.clear();
    this.activeMeasurement = null;
  }

  private readonly handleMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== this.options.hostOrigin) {
      return;
    }

    const message = hostToViewerMessageSchema.safeParse(event.data);

    if (!message.success) {
      return;
    }

    if (message.data.type === BridgeMessageType.ACTIVATE_TOOL) {
      this.activeMeasurement = message.data.payload;
      this.setActiveTool(message.data.payload.toolName);
      return;
    }

    if (this.activeMeasurement?.rowId === message.data.payload.rowId) {
      this.deactivateTool();
    }
  };

  private readonly handleMeasurementAdded = ({ measurement }: MeasurementEvent) => {
    if (
      !measurement?.uid ||
      !this.activeMeasurement ||
      measurement.toolName !== this.activeMeasurement.toolName
    ) {
      return;
    }

    const area = this.getArea(measurement);

    if (!area) {
      return;
    }

    const rowId = this.activeMeasurement.rowId;

    this.rowIdByAnnotationId.set(measurement.uid, rowId);
    this.postMeasurement(BridgeMessageType.MEASUREMENT_ADDED, measurement.uid, rowId, area);
    this.deactivateTool();
  };

  private readonly handleMeasurementUpdated = ({ measurement }: MeasurementEvent) => {
    if (!measurement?.uid || measurement.toolName !== 'EllipticalROI') {
      return;
    }

    const rowId = this.rowIdByAnnotationId.get(measurement.uid);
    const area = this.getArea(measurement);

    if (!rowId || !area) {
      return;
    }

    this.postMeasurement(BridgeMessageType.MEASUREMENT_UPDATED, measurement.uid, rowId, area);
  };

  private getArea(measurement: Measurement) {
    const stats = Object.values(measurement.data ?? {})[0] as
      | { area?: unknown; areaUnit?: unknown }
      | undefined;

    if (typeof stats?.area !== 'number' || typeof stats.areaUnit !== 'string') {
      return null;
    }

    return {
      value: stats.area,
      unit: stats.areaUnit,
    };
  }

  private deactivateTool() {
    this.activeMeasurement = null;
    this.setActiveTool('Pan');
  }

  private setActiveTool(toolName: 'EllipticalROI' | 'Pan') {
    this.options.commandsManager.runCommand('setToolActive', { toolName }, 'CORNERSTONE');
  }

  private postMeasurement(
    type: MeasurementMessageType,
    annotationId: string,
    rowId: string,
    area: { value: number; unit: string }
  ) {
    this.postToHost({
      version: BRIDGE_PROTOCOL_VERSION,
      type,
      payload: { rowId, annotationId, area },
    });
  }

  private readonly sendReady = () => {
    if (this.readySent) {
      return;
    }

    this.readySent = true;
    this.postToHost({
      version: BRIDGE_PROTOCOL_VERSION,
      type: BridgeMessageType.VIEWER_READY,
      payload: {},
    });
  };

  private postToHost(message: ViewerToHostMessage) {
    window.parent.postMessage(message, this.options.hostOrigin);
  }
}
