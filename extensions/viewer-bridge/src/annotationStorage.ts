import type { Types } from '@cornerstonejs/tools';

import type { ViewerToolName } from './constants';

export type StoredAnnotation = {
  rowId: string;
  annotationId: string;
  toolName: ViewerToolName;
  metadata?: Types.AnnotationMetadata;
  data: Types.AnnotationData;
};

const STUDY_INSTANCE_UID_PARAM = 'StudyInstanceUIDs';
const studyInstanceUID = new URLSearchParams(window.location.search).get(STUDY_INSTANCE_UID_PARAM);
const STORAGE_KEY = `viewer-bridge-annotations:${studyInstanceUID}`;

export function loadAnnotations(): StoredAnnotation[] {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as StoredAnnotation[]) : [];
  } catch {
    return [];
  }
}

export function saveAnnotation(annotation: StoredAnnotation) {
  const annotations = loadAnnotations().filter(
    item => item.annotationId !== annotation.annotationId
  );
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...annotations, annotation]));
}

export function removeAnnotation(annotationId: string) {
  const annotations = loadAnnotations().filter(item => item.annotationId !== annotationId);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
}
