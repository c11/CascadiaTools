privacy_real <- function(path) {
  path <- gsub("\\\\", "/", path)
  tail <- character()
  while (!file.exists(path) && dirname(path) != path) {
    tail <- c(basename(path), tail)
    path <- dirname(path)
  }
  result <- do.call(file.path, as.list(c(normalizePath(path, winslash = "/", mustWork = FALSE), tail)))
  if (.Platform$OS.type == "windows") tolower(result) else result
}

privacy_rx <- function(text) gsub("([][{}()+*^$|\\\\?.])", "\\\\\\1", text)
privacy_abs <- function(path) grepl("^(/|[A-Za-z]:[/\\\\]|\\\\\\\\)", path)

privacy_pipeline <- function(command, toolkit) {
  if (!is.character(toolkit) || length(toolkit) != 1L || !nzchar(toolkit)) return(FALSE)
  root <- privacy_real(toolkit)
  command <- trimws(command)
  for (quoted in c(shQuote(root), paste0('"', root, '"'), root)) {
    prefix <- paste0("export CASCADIATOOLS_ROOT=", quoted, ";")
    if (startsWith(command, prefix)) command <- trimws(substring(command, nchar(prefix) + 1L))
  }
  command <- gsub("${CASCADIATOOLS_ROOT}", root, command, fixed = TRUE)
  command <- gsub("$CASCADIATOOLS_ROOT", root, command, fixed = TRUE)
  if (grepl("[;|&\n\r`<>$]", command)) return(FALSE)
  token <- function(path) {
    escaped <- privacy_rx(file.path(root, path))
    paste0("(\"", escaped, "\"|'", escaped, "'|", escaped, ")")
  }
  job <- paste0("(", token("scripts/ejob"), "(\\s+-[cmt]\\s+[A-Za-z0-9:.]+)*\\s+--\\s+)?")
  grepl(paste0("^", job, token("scripts/Rscript"), "\\s+", token("core/run.R"),
               "\\s+(list|fit|figures|simulate|recover|power|selftest|describe)(\\s|$)"),
        command, perl = TRUE)
}

privacy_evaluate <- function(request) {
  decision <- function(value, reason = "") list(decision = value, reason = reason)
  scalar <- function(value) is.character(value) && length(value) == 1L && !is.na(value) && nzchar(value)
  if (!is.list(request) || !identical(request$version, 1L) ||
      !scalar(request$project) || !privacy_abs(request$project) ||
      !scalar(request$operation)) stop("Invalid privacy request: version, absolute project and operation required")
  project <- privacy_real(request$project)
  marker <- file.path(project, ".cascadia", "private.json")
  if (!file.exists(marker)) return(decision("allow"))
  cfg <- jsonlite::fromJSON(marker, simplifyVector = FALSE)
  if (!is.list(cfg) || !is.logical(cfg$private) || length(cfg$private) != 1L || is.na(cfg$private))
    stop("Invalid private.json: private must be true or false")
  if (!cfg$private) return(decision("allow"))
  dirs <- if (is.null(cfg$data_dirs)) c("data_raw", "data") else unlist(cfg$data_dirs)
  if (!is.character(dirs) || !length(dirs) || anyNA(dirs) || any(!nzchar(dirs)) ||
      any(vapply(dirs, privacy_abs, FALSE)) || any(grepl("(^|[/\\\\])\\.\\.([/\\\\]|$)", dirs)))
    stop("Invalid private.json: data_dirs must contain nonempty project-relative folders")
  dirs <- trimws(gsub("^[/\\\\]+|[/\\\\]+$", "", dirs))
  protected <- vapply(dirs, function(d) privacy_real(file.path(project, d)), "")
  message <- paste("Data-private mode is on: raw records cannot be read or printed.",
                   "Use CascadiaTools summary/report commands; unsupported tools and delegation are blocked.")
  deny <- function() decision("deny", message)
  paths <- unlist(request$paths, use.names = FALSE)
  if (is.null(paths)) paths <- character()
  if (!is.character(paths) || anyNA(paths)) stop("Invalid privacy request paths")
  resolve <- function(path) privacy_real(if (privacy_abs(path)) path else file.path(project, path))
  inside <- function(path) {
    path <- resolve(path)
    any(path == protected | startsWith(path, paste0(protected, "/")))
  }
  operation <- request$operation
  legacy <- identical(request$host, "claude")
  if (operation %in% c("read", "write")) {
    if (!length(paths) || any(!nzchar(paths))) stop("Missing file path")
    if (any(vapply(paths, inside, FALSE))) return(deny())
  } else if (operation == "search") {
    pattern <- if (is.null(request$pattern)) "" else request$pattern
    if (!is.character(pattern) || length(pattern) != 1L) stop("Invalid search pattern")
    if (any(vapply(paths[nzchar(paths)], inside, FALSE)) ||
        any(vapply(dirs, function(d) grepl(paste0("(^|[/\\\\])", privacy_rx(d), "([/\\\\]|$)"),
                                          pattern, perl = TRUE), FALSE))) return(deny())
    if (!legacy) {
      if (!length(paths)) return(deny())
      ancestors <- vapply(paths, function(p) {
        scope <- resolve(p)
        any(protected == scope | startsWith(protected, paste0(scope, "/")))
      }, FALSE)
      if (any(ancestors)) return(deny())
    }
  } else if (operation == "shell") {
    command <- request$command
    if (!scalar(command)) stop("Missing shell command")
    if (!legacy) {
      if (!privacy_pipeline(command, request$toolkit)) return(deny())
    } else {
      mentions <- any(vapply(dirs, function(d)
        grepl(paste0("(^|[\\s'\"=/\\\\(])", privacy_rx(d), "([/\\\\]|\\b)"),
              command, perl = TRUE), FALSE)) ||
        any(vapply(protected, function(d) grepl(d, gsub("\\\\", "/", command), fixed = TRUE), FALSE))
      pipeline <- grepl("core[/\\\\]run\\.R\\s+(fit|figures|simulate|recover|power|selftest|describe)\\b",
                        command, perl = TRUE) ||
        grepl("scripts[/\\\\]ejob\\b.*core[/\\\\]run\\.R", command, perl = TRUE)
      if (mentions && !pipeline) return(deny())
    }
  } else if (operation != "passive") {
    if (!legacy) return(deny())
  }
  decision("allow")
}
