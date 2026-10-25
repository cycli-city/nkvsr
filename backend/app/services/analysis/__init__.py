"""Query -> domain pipeline -> typed response models.

Request handlers stay thin; everything that can be wrong analytically lives in ``app.domain`` and is unit-tested there.
This package only validates parameters, runs the pipeline, caches the matched table (bounded LRU keyed on the dataset
fingerprint) and shapes results for the API. One module per concern:

====================  ============================================================================================
``service``           :class:`AnalysisService`, the facade the routes call (one method per endpoint)
``core``              :class:`AnalysisCore`: request context, matched-table cache, provenance, ``cache_version``
``summary``           ``/api/summary``                     ``accuracy``     ``/api/accuracy``
``series``            ``/api/timeseries``                  ``intervals``    ``/api/intervals`` (+ CSV export)
``vintages``          ``/api/forecast-vintages``           ``brief``        ``/api/decision-brief``
``sensitivity``       ``/api/cutoff-sensitivity``          ``metadata``     ``/api/metadata``
``context``           ``Ctx`` and ``IntervalQuery``        ``constants``    sort/filter vocabularies, presets
``convert``           NaN-safe converters into response models
====================  ============================================================================================
"""

from .constants import CUTOFF_PRESETS
from .context import Ctx, IntervalQuery
from .core import AnalysisCore
from .service import AnalysisService

__all__ = ["CUTOFF_PRESETS", "AnalysisCore", "AnalysisService", "Ctx", "IntervalQuery"]
