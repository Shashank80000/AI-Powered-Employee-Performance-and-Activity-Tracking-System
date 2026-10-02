"""Webcam capture and on-device presence detection with OpenCV.

A frame lives only in memory: it is grabbed, labelled and dropped. Nothing is written to disk.
OpenCV is imported lazily so the rest of the agent (and its tests) work without it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

MAX_WIDTH = 640
JPEG_QUALITY = 70
# Cameras adjust exposure over the first frames; earlier ones are often black.
WARMUP_FRAMES = 8
# Mean brightness / contrast below these means the lens is covered or the room is dark.
DARK_MEAN = 18.0
FLAT_STDDEV = 6.0


class CameraError(RuntimeError):
    """The webcam could not be opened or returned no frame (missing, busy or not permitted)."""


@dataclass(frozen=True)
class Frame:
    """One captured frame, kept in memory only."""

    jpeg: bytes
    gray: Any  # numpy array; used for local detection, never sent anywhere


def _cv2() -> Any:
    try:
        import cv2  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - depends on the install
        raise CameraError("OpenCV is not installed: pip install -r requirements.txt") from exc
    return cv2


def capture_frame(camera_index: int = 0) -> Frame:
    """Open the webcam, grab one frame, and release it straight away (the light goes off)."""
    cv2 = _cv2()
    capture = cv2.VideoCapture(camera_index)
    try:
        if not capture.isOpened():
            raise CameraError("Could not open the webcam. Check that it exists and that this "
                              "terminal has camera permission.")
        frame = None
        for _ in range(WARMUP_FRAMES):
            ok, frame = capture.read()
            if not ok:
                frame = None
        if frame is None:
            raise CameraError("The webcam returned no frame")
    finally:
        capture.release()

    height, width = frame.shape[:2]
    if width > MAX_WIDTH:
        frame = cv2.resize(frame, (MAX_WIDTH, round(height * MAX_WIDTH / width)))
    ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise CameraError("Could not encode the frame")
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return Frame(jpeg=encoded.tobytes(), gray=gray)


def is_blocked(gray: Any) -> bool:
    """True when the frame is too dark or too flat to show anything (covered lens)."""
    return float(gray.mean()) < DARK_MEAN or float(gray.std()) < FLAT_STDDEV


class LocalDetector:
    """Presence only: is a face in front of the screen? Runs fully on this machine."""

    def __init__(self) -> None:
        cv2 = _cv2()
        base = cv2.data.haarcascades
        self._cv2 = cv2
        self._frontal = cv2.CascadeClassifier(base + "haarcascade_frontalface_default.xml")
        self._profile = cv2.CascadeClassifier(base + "haarcascade_profileface.xml")

    def face_count(self, gray: Any) -> int:
        equalized = self._cv2.equalizeHist(gray)
        min_size = (max(40, gray.shape[1] // 12),) * 2
        for cascade in (self._frontal, self._profile):
            faces = cascade.detectMultiScale(equalized, scaleFactor=1.1, minNeighbors=5,
                                             minSize=min_size)
            if len(faces):
                return len(faces)
        return 0
