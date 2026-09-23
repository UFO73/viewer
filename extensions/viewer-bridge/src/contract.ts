import { z } from 'zod';

import { BridgeMessageType } from './constants';

export const BRIDGE_PROTOCOL_VERSION = 1 as const;

const rowIdSchema = z.string().min(1);
const measurementPayloadSchema = z.object({
  rowId: rowIdSchema,
  annotationId: z.string().min(1),
  area: z.object({
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
      toolName: z.literal('EllipticalROI'),
    }),
  }),
  z.object({
    version: z.literal(BRIDGE_PROTOCOL_VERSION),
    type: z.literal(BridgeMessageType.DEACTIVATE_TOOL),
    payload: z.object({
      rowId: rowIdSchema,
    }),
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
]);

export type HostToViewerMessage = z.infer<typeof hostToViewerMessageSchema>;
export type ViewerToHostMessage = z.infer<typeof viewerToHostMessageSchema>;
