import { z } from 'zod';

import { BridgeMessageType, ViewerTool } from './constants';

export const BRIDGE_PROTOCOL_VERSION = 1 as const;

const rowIdSchema = z.string().min(1);
const annotationIdSchema = z.string().min(1);
const annotationPayloadSchema = z.object({
  annotationId: annotationIdSchema,
});

const measurementPayloadSchema = z.object({
  rowId: rowIdSchema,
  annotationId: annotationIdSchema,
  toolName: z.enum([ViewerTool.ELLIPTICAL_ROI, ViewerTool.LENGTH]),
  metric: z.object({
    value: z.number(),
    unit: z.string().min(1),
  }),
});

export const hostToViewerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    version: z.literal(BRIDGE_PROTOCOL_VERSION),
    type: z.literal(BridgeMessageType.ACTIVATE_TOOL),
    payload: z.object({
      rowId: rowIdSchema,
      toolName: z.enum([ViewerTool.ELLIPTICAL_ROI, ViewerTool.LENGTH]),
    }),
  }),
  z.object({
    version: z.literal(BRIDGE_PROTOCOL_VERSION),
    type: z.literal(BridgeMessageType.DEACTIVATE_TOOL),
    payload: z.object({
      rowId: rowIdSchema,
    }),
  }),
  z.object({
    version: z.literal(BRIDGE_PROTOCOL_VERSION),
    type: z.literal(BridgeMessageType.FOCUS_MEASUREMENT),
    payload: annotationPayloadSchema,
  }),
  z.object({
    version: z.literal(BRIDGE_PROTOCOL_VERSION),
    type: z.literal(BridgeMessageType.DELETE_MEASUREMENT),
    payload: annotationPayloadSchema,
  }),
]);

export const viewerToHostMessageSchema = z.discriminatedUnion('type', [
  z.object({
    version: z.literal(BRIDGE_PROTOCOL_VERSION),
    type: z.literal(BridgeMessageType.VIEWER_READY),
    payload: z.object({}),
  }),
  z.object({
    version: z.literal(BRIDGE_PROTOCOL_VERSION),
    type: z.literal(BridgeMessageType.MEASUREMENT_ADDED),
    payload: measurementPayloadSchema,
  }),
  z.object({
    version: z.literal(BRIDGE_PROTOCOL_VERSION),
    type: z.literal(BridgeMessageType.MEASUREMENT_UPDATED),
    payload: measurementPayloadSchema,
  }),
  z.object({
    version: z.literal(BRIDGE_PROTOCOL_VERSION),
    type: z.literal(BridgeMessageType.MEASUREMENT_REMOVED),
    payload: z.object({
      rowId: rowIdSchema,
      annotationId: annotationIdSchema,
    }),
  }),
]);

export type HostToViewerMessage = z.infer<typeof hostToViewerMessageSchema>;
export type ViewerToHostMessage = z.infer<typeof viewerToHostMessageSchema>;
