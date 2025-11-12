import numpy as np
from PIL import Image
import mediapipe as mp

try:
    # Many Windows wheels expose only this:
    from mediapipe.python.solutions import face_mesh as mp_face_mesh
    from mediapipe.python.solutions.face_mesh_connections import (
        FACEMESH_LIPS,
        FACEMESH_LEFT_EYE,
        FACEMESH_RIGHT_EYE,
        FACEMESH_FACE_OVAL,
    )
except ImportError:
    # Some builds expose the top-level "solutions"
    from mediapipe.solutions import face_mesh as mp_face_mesh
    from mediapipe.solutions.face_mesh_connections import (
        FACEMESH_LIPS,
        FACEMESH_LEFT_EYE,
        FACEMESH_RIGHT_EYE,
        FACEMESH_FACE_OVAL,
    )

from scipy.spatial import Delaunay
import trimesh


def _np_image(path):
    img = Image.open(path).convert("RGB")
    return np.array(img), img


def _extract_landmarks(image_bgr):
    # MediaPipe expects RGB; our array is RGB already from PIL
    h, w = image_bgr.shape[:2]
    with mp_face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1, refine_landmarks=False) as fm:
        res = fm.process(image_bgr)
        if not res.multi_face_landmarks:
            return None
        lm = res.multi_face_landmarks[0].landmark
        xyz = np.array([[p.x * w, p.y * h, p.z * w] for p in lm], dtype=np.float32)  # scale z by width for isotropy
        return xyz  # shape (468, 3)


def _polygon_from_connections(connections):
    # connections is a set of pairs (i, j); get unique vertex list preserving order heuristic
    verts = set()
    for i, j in connections:
        verts.add(i)
        verts.add(j)
    return sorted(list(verts))


def _inside_polygon(pt, poly_xy):
    # ray casting algorithm for point in polygon
    x, y = pt
    inside = False
    n = len(poly_xy)
    for i in range(n):
        x1, y1 = poly_xy[i]
        x2, y2 = poly_xy[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1):
            inside = not inside
    return inside


def build_mesh_from_photo(photo_path):
    """
    Returns a dict with:
      - 'trimesh': textured trimesh.Trimesh
      - 'base_vertices': (N,3) np.ndarray (copy for animation baseline)
      - 'faces': (M,3) np.ndarray
      - 'uv': (N,2) np.ndarray in [0,1]
      - 'feature_indices': dict with 'lips', 'left_eye', 'right_eye' (lists of vertex indices)
    """
    rgb_np, pil_img = _np_image(photo_path)
    h, w = rgb_np.shape[:2]
    xyz = _extract_landmarks(rgb_np)
    if xyz is None:
        raise RuntimeError("No face landmarks detected. Try a clearer, frontal photo.")
    # Build triangulation in 2D (x,y) then filter triangles inside face oval
    points2d = xyz[:, :2].copy()
    tri = Delaunay(points2d)
    faces = tri.simplices.copy().astype(np.int32)

    # Build face-oval polygon (ordered by x then y as heuristic)
    oval_indices = _polygon_from_connections(FACEMESH_FACE_OVAL)
    oval_xy = points2d[oval_indices]
    # The connections are not ordered polygon vertices; sort by polar angle around center for a better boundary
    center = oval_xy.mean(axis=0)
    angles = np.arctan2(oval_xy[:, 1] - center[1], oval_xy[:, 0] - center[0])
    sort_idx = np.argsort(angles)
    oval_xy_sorted = oval_xy[sort_idx]
    # Filter out triangles whose centroids fall outside the oval polygon
    centroids = points2d[faces].mean(axis=1)
    mask_inside = np.array([_inside_polygon(c, oval_xy_sorted) for c in centroids])
    faces = faces[mask_inside]

    # Normalize/center geometry for nicer viewing
    verts = xyz.copy()
    # Flip Y to make +Y up
    verts[:, 1] = h - verts[:, 1]
    # Center
    center3 = np.array([w / 2, h / 2, np.median(verts[:, 2])], dtype=np.float32)
    verts -= center3
    # Scale to fit roughly unit size
    scale = max(w, h) / 2.0
    verts /= scale

    # UV from original (x,y) normalized (before centering)
    uv = np.stack([xyz[:, 0] / w, xyz[:, 1] / h], axis=1).astype(np.float32)
    uv[:, 1] = 1.0 - uv[:, 1]
    # Feature vertex index sets
    def _verts_from_conns(conns):
        s = set()
        for a, b in conns:
            s.add(a)
            s.add(b)
        return sorted(list(s))

    lips_idx = _verts_from_conns(FACEMESH_LIPS)
    leye_idx = _verts_from_conns(FACEMESH_LEFT_EYE)
    reye_idx = _verts_from_conns(FACEMESH_RIGHT_EYE)

    # Build textured trimesh
    tex = np.array(pil_img)  # RGB
    # trimesh expects colors in uint8
    tex_img = tex
    visual = trimesh.visual.texture.TextureVisuals(uv=uv, image=tex_img)
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, visual=visual, process=False)

    result = {
        "trimesh": mesh,
        "base_vertices": verts.copy(),
        "faces": faces,
        "uv": uv,
        "feature_indices": {
            "lips": lips_idx,
            "left_eye": leye_idx,
            "right_eye": reye_idx,
        },
    }
    return result


def export_obj(mesh: trimesh.Trimesh, out_obj_path: str):
    """
    Export a textured OBJ + MTL next to it.
    """
    mesh.export(out_obj_path)

