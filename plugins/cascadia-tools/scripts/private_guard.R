# Claude events by default; --neutral accepts the versioned shared privacy request.
extra <- strsplit(Sys.getenv("CASCADIATOOLS_RLIB", ""), .Platform$path.sep, fixed = TRUE)[[1]]
extra <- c(extra, file.path(Sys.getenv("CASCADIATOOLS_ROOT", ""), "Rlib"))
.libPaths(c(extra[nzchar(extra) & dir.exists(extra)], .libPaths()))
neutral <- "--neutral" %in% commandArgs(trailingOnly = TRUE)
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("Cascadia privacy guard requires jsonlite")
  quit(status = 3, save = "no")
}
script <- sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE)[1])
root <- Sys.getenv("CASCADIATOOLS_ROOT", "")
if (!nzchar(root)) root <- dirname(dirname(normalizePath(gsub("~+~", " ", script, fixed = TRUE))))
source(file.path(root, "scripts", "privacy_policy.R"))
result <- tryCatch({
  event <- jsonlite::fromJSON(paste(readLines(file("stdin"), warn = FALSE), collapse = "\n"),
                              simplifyVector = FALSE)
  if (neutral) {
    privacy_evaluate(event)
  } else {
    project <- Sys.getenv("CLAUDE_PROJECT_DIR", "")
    if (!nzchar(project)) project <- if (is.null(event$cwd)) getwd() else event$cwd
    tool <- event$tool_name
    input <- event$tool_input
    operation <- if (tool %in% c("Read", "Edit", "Write", "NotebookEdit")) {
      if (tool == "Read") "read" else "write"
    } else if (tool %in% c("Grep", "Glob")) "search" else if (tool %in% c("Bash", "PowerShell")) "shell" else "unsupported"
    path <- if (operation %in% c("read", "write")) {
      if (!is.null(input$file_path)) input$file_path else input$notebook_path
    } else input$path
    privacy_evaluate(list(version = 1L, host = "claude", project = project,
                          operation = operation, paths = if (is.null(path)) list() else list(path),
                          pattern = input$pattern, command = input$command))
  }
}, error = function(error) list(decision = "error", reason = conditionMessage(error)))
if (neutral) {
  cat(jsonlite::toJSON(result, auto_unbox = TRUE))
} else if (result$decision == "deny") {
  cat(jsonlite::toJSON(list(hookSpecificOutput = list(
    hookEventName = "PreToolUse", permissionDecision = "deny", permissionDecisionReason = result$reason)),
    auto_unbox = TRUE))
}
if (result$decision == "error") {
  message("Cascadia privacy guard: ", result$reason)
  quit(status = 3, save = "no")
}
