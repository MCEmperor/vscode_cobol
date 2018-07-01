# COBOL Source colouriser for Visual Studio Code

[![Version](https://vsmarketplacebadge.apphb.com/version/bitlang.cobol.svg)](https://marketplace.visualstudio.com/items?itemName=bitlang.cobol)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/bitlang.cobol.svg)](https://marketplace.visualstudio.com/items?itemName=bitlang.cobol)

--------------

## What is this?
Syntax highlighting for COBOL, JCL and MF directive files.

## What is this not?
An Integrated Development Environment for COBOL.

## What is it useful for?
Quick viewing of COBOL source and edit.

## What platform can it be used on?
Everywhere Visual Studio Code works.. aka Windows, Linux and Mac OSX.

## What does it look like?
 ![pi.cbl](https://raw.githubusercontent.com/spgennard/vscode_cobol/master/images/screenshot_pi.png)

## Keybinds

| Keys   | Description           |
|--------|:---------------------:|
| ctrl+alt+p  | Goto procedure division |
| ctrl+alt+w  | Goto working-storage section |
| ctrl+alt+d  | Goto data division (or working-storage section if not present) |
| ctrl+alt+,  | Go backwards to next section/division |
| ctrl+alt+.  | Go forward to next next section/division |
| f12 or ctrl+click | Move to copybook/file |
| ctrl+hover over copybook | Peek head of copybook |
| right mouse/peek | Peek copybook without opening the file) |

## Settings

- COBOL tab stops can be changed by editing the *coboleditor.tabstops* setting.
- Extensions used for *move to copybook*, can be changed by editting the *coboleditor.copybookexts* settings.
- Directories used for *move to copybook*, can be changed by editting the *coboleditor.copybookdirs* settings.

## Tasks

Visual Studio code can be setup to build your COBOL source code.

### Task: Using MsBuild

MsBuild based projects can be consumed as build task, allowing navigation to error/warnings when they occur.

Below is an example of *build* task that uses *mycobolproject.sln*.

```json
{
    "version": "2.0.0",
    "tasks": [ {
            "label": "build",
            "type": "shell",
            "command": "msbuild",
            "args": [
                "/property:GenerateFullPaths=true",
                "/t:build",
                "mycobolproject.sln"
            ],
            "group": {
                "kind": "build",
                "isDefault": true
            },
            "presentation": {
                "reveal": "always"
            },
            "problemMatcher": "$mfcobol-msbuild"
        }
    ]

}
```

### Task: Single file compile using Micro Focus COBOL

The example below shows you how you can create a single task to compile one program using the `cobol` command.

```json
{
    "label": "cobol (single file)",
    "command": "cobol",
    "args": [
        "${file}",
        "noint",
        "nognt",
        "noobj",
        "noquery",
        "errformat(3)",
        "COPYPATH($COBCPY;${workspaceFolder}\\CopyBooks;${workspaceFolder}\\CopyBooks\\Public)",
        ";"
    ],
    "group": {
        "kind": "build",
        "isDefault": true
    },
    "options": {
        "cwd": "${workspaceRoot}"
    },
    "presentation": {
        "echo": true,
        "reveal": "never",
        "focus": true,
        "panel": "dedicated"
    },
    "problemMatcher": "$mfcobol-errformat3"
    }
}
```

### Task: Single file compile using GNU COBOL/OpenCOBOL/COBOL-IT

The example below shows you how you can create a single task to compile one program using the `cobc` command.

```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "gnu cobol - cobc (single file)",
            "type": "shell",
            "command": "cobc",
            "args": [
                "-fsyntax-only", 
                "${file}"
            ],
            "problemMatcher" : "$gnucobol-cobc"
        }
    ]
}
```

## Complementary extensions

### [ToDo tree](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.todo-tree) by Gruntfuggly

Although this extension does not understand comments in COBOL source files, it can be made to my adding the following user setting:

```json
{
    "todo-tree.flat": false,
    "todo-tree.expanded": true,

    "todo-tree.regex": "((//|#|<!--|;|/\\*|\\*>|^      \\*)\\s*($TAGS)|^\\s*- \\[ \\])",
    "todo-tree.tags": [
        "TODO",
        "FIXME",
        "!FIXME",
        "CHANGED",
        "BUG",
        "NOTE"
    ],
    "todo-tree.filterCaseSensitive": true,
    
    "todo-tree.iconColours": {
        "FIXME" : "#A188FF",
        "!FIXME" : "red",
        "NOTE" : "blue",
        "TODO" : "cyan",
        "CHANGED" : "yellow",
        "BUG" : "red"
    }
}
```
