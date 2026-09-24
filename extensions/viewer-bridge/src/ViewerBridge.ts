import {
  BRIDGE_PROTOCOL_VERSION,
  hostToViewerMessageSchema,
  type ViewerToHostMessage,
} from './contract';
import { BridgeMessageType, type MeasurementMessageType } from './constants';

type ActiveMeasurement = {
  rowId: string;
  toolName: 'EllipticalROI' | 'Length';
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
  getState: () => { viewports: Map<unknown, unknown> };
};

export type ViewerBridgeOptions = {
  commandsManager: {
    runCommand: (
      commandName: string,
      options: { toolName?: string; uid?: string },
      context?: string
    ) => unknown;
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
  private readonly measurementByAnnotationId = new Map<string, ActiveMeasurement>();
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
    this.measurementByAnnotationId.clear();
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

    if (message.data.type === BridgeMessageType.FOCUS_MEASUREMENT) {
      this.options.commandsManager.runCommand('jumpToMeasurement', {
        uid: message.data.payload.annotationId,
      });
      return;
    }

    if (message.data.type === BridgeMessageType.DELETE_MEASUREMENT) {
      this.options.commandsManager.runCommand('removeMeasurement', {
        uid: message.data.payload.annotationId,
      });
      this.measurementByAnnotationId.delete(message.data.payload.annotationId);
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

    const metric = this.getMetric(measurement);

    if (!metric) {
      return;
    }

    const activeMeasurement = this.activeMeasurement;

    this.measurementByAnnotationId.set(measurement.uid, activeMeasurement);
    this.postMeasurement(
      BridgeMessageType.MEASUREMENT_ADDED,
      measurement.uid,
      activeMeasurement,
      metric
    );
    this.deactivateTool();
  };

  private readonly handleMeasurementUpdated = ({ measurement }: MeasurementEvent) => {
    if (!measurement?.uid) {
      return;
    }

    const activeMeasurement = this.measurementByAnnotationId.get(measurement.uid);
    const metric = this.getMetric(measurement);

    if (!activeMeasurement || measurement.toolName !== activeMeasurement.toolName || !metric) {
      return;
    }

    this.postMeasurement(
      BridgeMessageType.MEASUREMENT_UPDATED,
      measurement.uid,
      activeMeasurement,
      metric
    );
  };

  private getMetric(measurement: Measurement) {
    const stats = Object.values(measurement.data ?? {})[0] as
      | { area?: unknown; areaUnit?: unknown; length?: unknown; unit?: unknown }
      | undefined;

    const value = measurement.toolName === 'Length' ? stats?.length : stats?.area;
    const unit = measurement.toolName === 'Length' ? stats?.unit : stats?.areaUnit;

    if (typeof value !== 'number' || typeof unit !== 'string') {
      return null;
    }

    return { value, unit };
  }

  private deactivateTool() {
    this.activeMeasurement = null;
    this.setActiveTool('Pan');
  }

  private setActiveTool(toolName: 'EllipticalROI' | 'Length' | 'Pan') {
    this.options.commandsManager.runCommand('setToolActive', { toolName }, 'CORNERSTONE');
  }

  private postMeasurement(
    type: MeasurementMessageType,
    annotationId: string,
    activeMeasurement: ActiveMeasurement,
    metric: { value: number; unit: string }
  ) {
    this.postToHost({
      version: BRIDGE_PROTOCOL_VERSION,
      type,
      payload: { ...activeMeasurement, annotationId, metric },
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
