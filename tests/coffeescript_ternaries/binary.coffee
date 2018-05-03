funnelSnapshotCard =
  if report is MY_OVERVIEW and not ReportGK.xar_metrics_active_capitol_v2 or report is COMPANY_OVERVIEW and not ReportGK.xar_metrics_active_capitol_v2_company_metrics
    <ReportMetricsFunnelSnapshotCard metrics={metrics} />
  else
    null

room = room.map (row, rowIndex) ->
  row.map (col, colIndex) ->
    if rowIndex is 0 or colIndex is 0 or rowIndex is height or colIndex is width
      1
    else
      0
