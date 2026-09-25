import { annotation } from '@cornerstonejs/tools';

import {
  BRIDGE_PROTOCOL_VERSION,
  hostToViewerMessageSchema,
  type ViewerToHostMessage,
} from './contract';
import {
  BridgeMessageType,
  DEFAULT_VIEWER_TOOL,
  type MeasurementMessageType,
  ViewerTool,
  type ViewerToolName,
} from './constants';
import {
  loadAnnotations,
  removeAnnotation,
  saveAnnotation,
  type StoredAnnotation,
} from './annotationStorage';

type ActiveMeasurement = {
  rowId: string;
  toolName: ViewerToolName;
};

type Measurement = {
  uid?: string;
  toolName?: string;
  data?: Record<string, unknown>;
};

type MeasurementEvent = {
  measurement?: Measurement | string;
};

type Subscription = {
  unsubscribe: () => void;
};

type MeasurementService = {
  EVENTS: {
    MEASUREMENT_ADDED: string;
    MEASUREMENT_UPDATED: string;
    MEASUREMENT_REMOVED: string;
  };
  subscribe: (event: string, callback: (event: MeasurementEvent) => void) => Subscription;
  getSource: (
    name: string,
    version: string
  ) => {
    annotationToMeasurement: (toolName: ViewerToolName, detail: unknown) => unknown;
  };
};

type CornerstoneViewportService = {
  getRenderingEngine: () => { render: () => void } | undefined;
};

type DisplaySetService = {
  getDisplaySetByUID: (displaySetInstanceUID: string) => { imageIds?: string[] } | undefined;
};

type ViewportGridService = {
  EVENTS: {
    VIEWPORTS_READY: string;
  };
  subscribe: (event: string, callback: () => void) => Subscription;
  getState: () => {
    viewports: Map<unknown, { displaySetInstanceUIDs?: string[]; isReady: boolean }>;
  };
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
      cornerstoneViewportService: CornerstoneViewportService;
      displaySetService: DisplaySetService;
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
  private ready = false;

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
      measurementService.subscribe(
        measurementService.EVENTS.MEASUREMENT_REMOVED,
        this.handleMeasurementRemoved
      ),
      viewportGridService.subscribe(viewportGridService.EVENTS.VIEWPORTS_READY, this.sendReady),
    ];

    this.respondReady();
  }

  destroy() {
    if (this.activeMeasurement) {
      this.deactivateTool();
    }
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

    switch (message.data.type) {
      case BridgeMessageType.REQUEST_VIEWER_READY:
        this.respondReady();
        break;
      case BridgeMessageType.ACTIVATE_TOOL:
        this.activateTool(message.data.payload);
        break;
      case BridgeMessageType.DEACTIVATE_TOOL:
        this.cancelDrawing(message.data.payload.rowId);
        break;
      case BridgeMessageType.FOCUS_MEASUREMENT:
        this.focusMeasurement(message.data.payload.annotationId);
        break;
      case BridgeMessageType.DELETE_MEASUREMENT:
        this.deleteMeasurement(message.data.payload.annotationId);
        break;
    }
  };

  private activateTool(measurement: ActiveMeasurement) {
    this.activeMeasurement = measurement;
    this.setActiveTool(measurement.toolName);
  }

  private cancelDrawing(rowId: string) {
    if (this.activeMeasurement?.rowId === rowId) {
      this.deactivateTool();
    }
  }

  private focusMeasurement(annotationId: string) {
    this.options.commandsManager.runCommand('jumpToMeasurement', { uid: annotationId });
  }

  private deleteMeasurement(annotationId: string) {
    this.options.commandsManager.runCommand('removeMeasurement', { uid: annotationId });
  }

  private readonly handleMeasurementAdded = ({ measurement }: MeasurementEvent) => {
    if (
      typeof measurement === 'string' ||
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
    this.storeAnnotation(measurement.uid, activeMeasurement);
    this.postMeasurement(
      BridgeMessageType.MEASUREMENT_ADDED,
      measurement.uid,
      activeMeasurement,
      metric
    );
    this.deactivateTool();
  };

  private readonly handleMeasurementUpdated = ({ measurement }: MeasurementEvent) => {
    if (!measurement || typeof measurement === 'string' || !measurement.uid) {
      return;
    }

    const activeMeasurement = this.measurementByAnnotationId.get(measurement.uid);
    const metric = this.getMetric(measurement);

    if (!activeMeasurement || measurement.toolName !== activeMeasurement.toolName || !metric) {
      return;
    }

    this.storeAnnotation(measurement.uid, activeMeasurement);
    this.postMeasurement(
      BridgeMessageType.MEASUREMENT_UPDATED,
      measurement.uid,
      activeMeasurement,
      metric
    );
  };

  private readonly handleMeasurementRemoved = ({ measurement }: MeasurementEvent) => {
    if (typeof measurement !== 'string') {
      return;
    }

    const activeMeasurement = this.measurementByAnnotationId.get(measurement);

    if (!activeMeasurement) {
      return;
    }

    this.measurementByAnnotationId.delete(measurement);
    removeAnnotation(measurement);
    this.postToHost({
      version: BRIDGE_PROTOCOL_VERSION,
      type: BridgeMessageType.MEASUREMENT_REMOVED,
      payload: { rowId: activeMeasurement.rowId, annotationId: measurement },
    });
  };

  private getMetric(measurement: Measurement) {
    const stats = Object.values(measurement.data ?? {})[0] as
      | { area?: unknown; areaUnit?: unknown; length?: unknown; unit?: unknown }
      | undefined;

    const value = measurement.toolName === ViewerTool.LENGTH ? stats?.length : stats?.area;
    const unit = measurement.toolName === ViewerTool.LENGTH ? stats?.unit : stats?.areaUnit;

    if (typeof value !== 'number' || typeof unit !== 'string') {
      return null;
    }

    return { value, unit };
  }

  private storeAnnotation(annotationId: string, activeMeasurement: ActiveMeasurement) {
    const sourceAnnotation = annotation.state.getAnnotation(annotationId);

    if (!sourceAnnotation) {
      return;
    }

    saveAnnotation({
      ...activeMeasurement,
      annotationId,
      metadata: sourceAnnotation.metadata,
      data: sourceAnnotation.data,
    });
  }

  private restoreAnnotations() {
    const { cornerstoneViewportService, measurementService } =
      this.options.servicesManager.services;
    const annotationManager = annotation.state.getAnnotationManager();
    const measurementSource = measurementService.getSource('Cornerstone3DTools', '0.1');

    loadAnnotations()
      .filter(this.isAnnotationVisible)
      .forEach(storedAnnotation => {
        this.measurementByAnnotationId.set(storedAnnotation.annotationId, {
          rowId: storedAnnotation.rowId,
          toolName: storedAnnotation.toolName,
        });

        if (annotation.state.getAnnotation(storedAnnotation.annotationId)) {
          return;
        }

        const restoredAnnotation = this.createAnnotation(storedAnnotation);

        annotationManager.addAnnotation(restoredAnnotation);
        measurementSource.annotationToMeasurement(storedAnnotation.toolName, {
          uid: storedAnnotation.annotationId,
          annotation: restoredAnnotation,
        });
      });

    cornerstoneViewportService.getRenderingEngine()?.render();
  }

  private readonly isAnnotationVisible = (storedAnnotation: StoredAnnotation) => {
    const referencedImageId = storedAnnotation.metadata?.referencedImageId;

    if (!referencedImageId) {
      return false;
    }

    const { displaySetService, viewportGridService } = this.options.servicesManager.services;
    const displaySetInstanceUIDs = [...viewportGridService.getState().viewports.values()].flatMap(
      viewport => viewport.displaySetInstanceUIDs ?? []
    );

    return displaySetInstanceUIDs.some(displaySetInstanceUID =>
      displaySetService
        .getDisplaySetByUID(displaySetInstanceUID)
        ?.imageIds?.includes(referencedImageId)
    );
  };

  private createAnnotation(storedAnnotation: StoredAnnotation) {
    return {
      annotationUID: storedAnnotation.annotationId,
      highlighted: false,
      invalidated: true,
      metadata: storedAnnotation.metadata,
      data: storedAnnotation.data,
    };
  }

  private deactivateTool() {
    this.activeMeasurement = null;
    this.setActiveTool(DEFAULT_VIEWER_TOOL);
  }

  private setActiveTool(toolName: ViewerToolName | typeof DEFAULT_VIEWER_TOOL) {
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
    if (this.ready) {
      return;
    }

    this.restoreAnnotations();
    this.ready = true;
    this.postReady();
  };

  private respondReady() {
    if (!this.ready && this.hasReadyViewports()) {
      this.sendReady();
      return;
    }

    if (this.ready) {
      this.postReady();
    }
  }

  private hasReadyViewports() {
    const viewports = [
      ...this.options.servicesManager.services.viewportGridService.getState().viewports.values(),
    ].filter(viewport => viewport.displaySetInstanceUIDs?.length);

    return viewports.length > 0 && viewports.every(viewport => viewport.isReady);
  }

  private postReady() {
    this.postToHost({
      version: BRIDGE_PROTOCOL_VERSION,
      type: BridgeMessageType.VIEWER_READY,
      payload: {},
    });
  }

  private postToHost(message: ViewerToHostMessage) {
    window.parent.postMessage(message, this.options.hostOrigin);
  }
}
