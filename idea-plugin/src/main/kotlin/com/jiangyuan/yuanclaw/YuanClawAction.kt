package com.jiangyuan.yuanclaw

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import org.jetbrains.plugins.terminal.TerminalToolWindowManager

class YuanClawAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val workingDir = project.basePath ?: return

        val terminalManager = TerminalToolWindowManager.getInstance(project)
        val widget = terminalManager.createLocalShellWidget(workingDir, "yuan-claw")
        widget.executeCommand("yuan-claw")
    }
}
