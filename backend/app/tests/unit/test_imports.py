"""Garde-fou : toutes les annotations des services doivent être résolubles."""

import typing


def test_project_service_annotations_resolve():
    from app.services.project_service import ProjectService

    for fn in vars(ProjectService).values():
        if callable(fn):
            typing.get_type_hints(fn)  # lève NameError si un nom est indéfini
